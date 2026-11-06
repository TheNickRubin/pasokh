"""Offline regressions: no agent, Git mutation, timer, or GitHub operation runs."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest


RUNNER = Path(__file__).with_name("run-ticket.py").resolve()
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


if __name__ == "__main__":
    unittest.main()
