"""Offline regressions: no agent, Git mutation, timer, or GitHub operation runs."""
from pathlib import Path
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


RUNNER = Path(__file__).with_name("run-ticket.py").resolve()
SPEC = importlib.util.spec_from_file_location("ticket_runner", RUNNER)
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)
CHILD = r'''
import importlib.util
from pathlib import Path
import sys
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ticket_runner", sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
home = Path(sys.argv[2])
runner.ROOT = home
(home / ".git").mkdir()
artifacts = home / "dev/work/pasokh/run"
scenario = sys.argv[3]

def offline_execute(job):
    if scenario == "progress_then_blocked":
        job.event("trigger_fired", issue="offline fixture")
    raise runner.Stop("fixture requires human review")

sys.argv = [str(runner.ROOT / "tools/run-ticket.py"), "--issue", "1", "--base", "main",
            "--branch", "day-04/offline-test", "--artifacts", str(artifacts),
            "--allow-file", "src/cli.ts"]
# Wait until the parent has closed the pipe's read end; this makes EPIPE deterministic.
sys.stdin.readline()
with patch.object(runner.Path, "home", return_value=home), \
     patch.object(runner.subprocess, "check_output", return_value=".git\n"), \
     patch.object(runner.Job, "execute", offline_execute):
    sys.exit(runner.main())
'''


class DetachedStdoutTests(unittest.TestCase):
    def run_detached(self, scenario):
        with tempfile.TemporaryDirectory(prefix="pasokh-output-regression-") as directory:
            child = subprocess.Popen(
                [sys.executable, "-B", "-c", CHILD, str(RUNNER), directory, scenario],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            child.stdout.close()
            child.stdin.write("go\n")
            child.stdin.close()
            try:
                code = child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
                raise
            stderr = child.stderr.read()
            child.stderr.close()
            artifacts = Path(directory) / "dev/work/pasokh/run"
            events = [json.loads(line) for line in (artifacts / "events.jsonl").read_text().splitlines()]
            result_path = artifacts / "result.json"
            self.assertTrue(result_path.exists(), f"Final result missing; exit={code}; stderr={stderr}")
            result = json.loads(result_path.read_text())
            self.assertEqual(code, 2, stderr)
            self.assertNotIn("BrokenPipeError", stderr)
            self.assertEqual(result, {"status": "needs_human", "reason": "fixture requires human review",
                                      "pr": None, "merged": False})
            self.assertEqual(events[-1]["state"], "needs_human")
            self.assertEqual(events[-1]["reason"], "fixture requires human review")
            return events

    def test_closed_stdout_cannot_erase_failure_result(self):
        self.run_detached("blocked")

    def test_progress_with_closed_stdout_preserves_the_real_stop_reason(self):
        events = self.run_detached("progress_then_blocked")
        self.assertEqual([event["state"] for event in events], ["trigger_fired", "needs_human"])


SHA = "a" * 40
STALE = "b" * 40


def review(sha=SHA, body="## Code Review by Qodo\nNo problems found."):
    return {"key": "issues/8/comments:1", "kind": "issue_comment", "commit_id": None,
            "body": body + f"\n<!-- https://github.com/{runner.REPO}/commit/{sha} -->"}


class ReviewEvidenceTests(unittest.TestCase):
    def test_busy_stale_unattributed_and_inline_only_are_not_completed_review(self):
        examples = [review(body="Qodo is busy working\nCode Review by Qodo"), review(STALE),
                    {"kind": "issue_comment", "body": "Code Review by Qodo"},
                    {"kind": "inline_comment", "commit_id": SHA, "body": "A finding"}]
        for item in examples:
            with self.subTest(item=item):
                self.assertEqual(runner.completed_reviews([item], SHA), [])

    def test_completed_current_head_accepts_marker_or_review_commit_id(self):
        completed = review()
        substantive = {"kind": "review", "state": "CHANGES_REQUESTED", "commit_id": SHA,
                       "body": "Handle the missing-operand case."}
        self.assertEqual(runner.completed_reviews([completed, substantive], SHA), [completed, substantive])

    def test_existing_completed_review_is_used_without_duplicate_request(self):
        with tempfile.TemporaryDirectory() as directory:
            job = runner.Job(SimpleNamespace(artifacts=Path(directory) / "run", review_timeout=15))
            job.pr = 8
            with patch.object(job, "comments", return_value=[review()]), \
                    patch.object(job, "run") as command, patch.object(job, "event"):
                self.assertEqual(job.request_review(SHA, 0), [review()])
                command.assert_not_called()
            self.assertEqual(json.loads((job.out / "review-0.json").read_text()), [review()])

    def test_poll_skips_progress_then_returns_completed_review(self):
        busy = review(body="Qodo is busy working")
        with tempfile.TemporaryDirectory() as directory:
            job = runner.Job(SimpleNamespace(artifacts=Path(directory) / "run", review_timeout=15))
            job.pr = 8
            with patch.object(job, "comments", side_effect=[[busy], [busy], [review()]]), \
                    patch.object(job, "run") as command, patch.object(job, "event"), \
                    patch.object(runner.time, "sleep") as sleep:
                self.assertEqual(job.request_review(SHA, 0), [review()])
                command.assert_called_once()
                self.assertIn("/agentic_review", command.call_args.args[0])
                sleep.assert_called_once()


class ResumeTests(unittest.TestCase):
    def valid_pr(self):
        return {"number": 8, "url": f"https://github.com/{runner.REPO}/pull/8", "state": "OPEN",
                "headRefName": "day-04/help", "headRefOid": SHA, "baseRefName": "main",
                "isCrossRepository": False}

    def test_resume_rejects_wrong_branch_head_base_closed_or_fork_pr(self):
        for field, value in {"headRefName": "other", "headRefOid": STALE, "baseRefName": "other",
                             "state": "CLOSED", "isCrossRepository": True}.items():
            with self.subTest(field=field):
                pr = self.valid_pr() | {field: value}
                with self.assertRaises(runner.Stop):
                    runner.validate_resume_pr(pr, "day-04/help", "main", SHA)

    def test_resume_reuses_checkout_pr_and_current_issue_comments_preserving_original(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original"
            checkout = source / "checkout"
            checkout.mkdir(parents=True)
            original = {"number": 5, "title": "Help", "body": "Original criteria",
                        "url": f"https://github.com/{runner.REPO}/issues/5", "state": "OPEN"}
            current = original | {"comments": [{"body": "Standalone means sole argument --help."}]}
            (source / "ticket.json").write_text(json.dumps(original))
            events = [{"state": "scheduled", "branch": "day-04/help"},
                      {"state": "pr_opened", "url": self.valid_pr()["url"], "head": STALE}]
            (source / "events.jsonl").write_text("\n".join(json.dumps(item) for item in events))
            before = {path.name: path.read_bytes() for path in source.iterdir() if path.is_file()}
            args = SimpleNamespace(artifacts=Path(directory) / "resumed", resume_run=source,
                                   issue=5, branch="day-04/help", base="main", allow_file=["src/cli.ts"])
            job = runner.Job(args)
            listing = f"worktree {checkout.resolve()}\nHEAD {SHA}\nbranch refs/heads/day-04/help\n"
            with patch.object(job, "git", return_value=listing), \
                    patch.object(job, "resume_snapshot", return_value=(SHA, self.valid_pr())) as snapshot, \
                    patch.object(job, "run", return_value=json.dumps(current)) as command, \
                    patch.object(job, "event"), patch.object(job, "arm") as arm, \
                    patch.object(job, "review_loop") as loop, patch.object(job, "agent") as agent:
                job.resume()
                self.assertEqual(snapshot.call_count, 2)
                arm.assert_called_once_with(current, SHA, resume=True)
                loop.assert_called_once_with(current, SHA, self.valid_pr()["url"])
                agent.assert_not_called()
                command.assert_called_once()
                self.assertIn("comments", command.call_args.args[0][-1])
            self.assertEqual(job.checkout, checkout.resolve())
            self.assertEqual(job.pr, 8)
            self.assertEqual(json.loads((job.out / "ticket.json").read_text()), current)
            self.assertEqual(before, {path.name: path.read_bytes() for path in source.iterdir() if path.is_file()})


class PublicationBoundaryTests(unittest.TestCase):
    def test_effective_pushurl_and_url_rewrite_cannot_redirect_publication(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {"GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}):
            job = runner.Job(SimpleNamespace(artifacts=Path(directory) / "run"))
            subprocess.run(["git", "init", "-q", str(job.checkout)], check=True)

            def config(key, value):
                subprocess.run(["git", "-C", str(job.checkout), "config", key, value], check=True)

            config("remote.origin.url", f"https://github.com/{runner.REPO}.git")
            job.verify_push_destination()
            config("remote.origin.pushurl", "https://example.invalid/stolen.git")
            with self.assertRaisesRegex(runner.Stop, "push destination"):
                job.verify_push_destination()
            subprocess.run(["git", "-C", str(job.checkout), "config", "--unset", "remote.origin.pushurl"], check=True)
            config("url.https://example.invalid/.pushInsteadOf", "https://github.com/")
            with self.assertRaisesRegex(runner.Stop, "push destination"):
                job.verify_push_destination()

    def test_agent_uses_exact_edit_rules_for_both_file_tools_without_blanket_grants(self):
        with tempfile.TemporaryDirectory() as directory:
            job = runner.Job(SimpleNamespace(artifacts=Path(directory) / "run",
                                             allow_file=["src/cli.ts", "test/cli.test.ts"], agent_timeout=30))
            job.checkout.mkdir()
            metadata = Path(directory).resolve() / "metadata"
            response = json.dumps({"structured_output": {"status": "ready", "review_complete": False,
                                                           "summary": "offline fixture"}})
            with patch.object(job, "git", return_value=str(metadata)), \
                    patch.object(job, "run", return_value=response) as command, patch.object(job, "verify_scope"):
                job.agent("Offline fixture", "permission-test")
            argv = command.call_args.args[0]
            allows = argv[argv.index("--allowedTools") + 1:argv.index("--disallowedTools")]
            self.assertNotIn("Edit", allows)
            self.assertNotIn("Write", allows)
            self.assertEqual([rule for rule in allows if rule.startswith("Edit(")],
                             [f"Edit(/{job.checkout}/src/cli.ts)", f"Edit(/{job.checkout}/test/cli.test.ts)"])
            self.assertFalse(any(rule.startswith("Write(") for rule in allows))
            self.assertIn(f"Read(/{metadata}/**)", argv)
            self.assertIn(f"Edit(/{metadata}/**)", argv)

    def test_host_git_commands_disable_hooks_and_fsmonitor(self):
        with tempfile.TemporaryDirectory() as directory:
            job = runner.Job(SimpleNamespace(artifacts=Path(directory) / "run"))
            with patch.object(job, "run", return_value="") as command:
                job.git("status", "--porcelain")
            argv = command.call_args.args[0]
            self.assertEqual(argv[:5], ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"])

    def test_remote_change_after_triage_prevents_ready_result(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(artifacts=Path(directory) / "run", branch="day-04/help", base="main",
                                   allow_file=["src/cli.ts"], issue=5)
            job = runner.Job(args)
            job.pr = 8
            pr = ResumeTests().valid_pr()
            current = json.dumps(pr)
            changed = json.dumps(pr | {"headRefOid": STALE})
            issue = {"url": f"https://github.com/{runner.REPO}/issues/5"}
            with patch.object(job, "git", return_value=SHA), \
                    patch.object(job, "run", side_effect=[current, current, changed]), \
                    patch.object(job, "request_review", return_value=[review()]), \
                    patch.object(job, "agent", return_value={"status": "ready", "review_complete": True, "summary": "ok"}), \
                    patch.object(job, "checks"), patch.object(job, "verify_scope", return_value=[]), \
                    patch.object(job, "publish") as publish:
                with self.assertRaisesRegex(runner.Stop, "current PR head"):
                    job.review_loop(issue, SHA, pr["url"])
                publish.assert_not_called()
            self.assertFalse((job.out / "result.json").exists())

    def test_remote_change_before_correction_push_prevents_push(self):
        with tempfile.TemporaryDirectory() as directory:
            args = SimpleNamespace(artifacts=Path(directory) / "run", branch="day-04/help", base="main")
            job = runner.Job(args)
            job.pr = 8
            changed = json.dumps(ResumeTests().valid_pr() | {"headRefOid": STALE})
            with patch.object(job, "verify_scope", return_value=["src/cli.ts"]), \
                    patch.object(job, "git", return_value="c" * 40) as git, \
                    patch.object(job, "run", return_value=changed):
                with self.assertRaisesRegex(runner.Stop, "current PR head"):
                    job.publish("offline correction", expected_pr_head=SHA)
                self.assertFalse(any(call.args[0] == "push" for call in git.call_args_list))


if __name__ == "__main__":
    unittest.main()
