# One scheduled ticket

`tools/run-ticket.py` runs one explicitly selected GitHub issue after a short
one-shot timer. It uses the existing `gh` login and Claude Code subscription
login. It does not install a daemon, add credentials, or schedule future work.

The timer firing is the automatic trigger. The event log records both the
scheduled time and the actual trigger. Keeping the process alive is required;
closing its terminal before completion can interrupt the job.

## Run

First create one small issue with concrete acceptance criteria, and ensure the
desired base branch is pushed. Use a new task branch and a new evidence directory
for each run. Select the permitted files explicitly.

```sh
python3 tools/run-ticket.py \
  --issue ISSUE_NUMBER \
  --base BASE_BRANCH \
  --branch day-04/cli-help \
  --artifacts "$HOME/dev/work/pasokh/2026-11-05/day-04-run-01" \
  --allow-file src/cli.ts \
  --allow-file test/cli.test.ts \
  --allow-file README.md
```

The command waits 15 seconds, creates a registered Git worktree in the evidence
directory, installs locked development dependencies with lifecycle scripts
disabled, then starts Claude. It reads the selected ticket plus `AGENTS.md` and
`README.md`, implements the task, adds acceptance and edge/failure checks, and
runs the project checks. The host also runs those checks independently before
committing, pushing the selected branch and opening the PR.

The host requests `/agentic_review`, waits at most five minutes for new Qodo
evidence, then asks Claude to investigate it. Confirmed fixes are checked and
pushed for another review. At most two repair cycles are permitted. No merge
command exists in the runner. A completed run means **ready for human review**,
never merged, accepted by Nic, or accepted by hackathon judges.

## Resume an existing PR at review

If implementation opened a PR but review was unavailable, resume that original
run explicitly. Use its original branch, issue number, the PR's current base
branch, and a **new, separate** evidence directory:

```sh
python3 tools/run-ticket.py \
  --resume-run "$HOME/dev/work/pasokh/2026-11-05/day-04-run-01" \
  --artifacts "$HOME/dev/work/pasokh/2026-11-05/day-04-review-01" \
  --issue ISSUE_NUMBER \
  --base CURRENT_PR_BASE \
  --branch day-04/cli-help \
  --allow-file src/cli.ts \
  --allow-file test/cli.test.ts \
  --allow-file README.md
```

Resume reads the original ticket and PR-opened event, then verifies the
registered checkout, remote, clean branch, current PR head, base and open state.
It fetches the current issue **including comments**, so later acceptance
clarifications reach the reviewer. It records both the original and current
ticket in the new evidence directory. After the same one-shot timer fires, it
validates the checkout and PR again and enters the bounded review loop. It does
not rerun implementation, install dependencies, create another branch or PR,
or overwrite original logs. Review fixes edit the original registered checkout
and push its existing task branch. Keep that checkout stable during the run.

The original run directory must contain exactly one PR-opened event. Resume
from that original directory, rather than from a review-only continuation.
Each explicit invocation permits at most two repair cycles; exhausted runs
require a human decision before another invocation.

## Bounds and evidence

- One issue and one `day-04/` branch: new for implementation, explicitly reused
  only in resume mode. No batch ticket selection.
- One repository lock prevents concurrent runs of this runner. It does not lock
  other editors or Git clients; coordinate with them before launch.
- Changes outside the explicit source/test/README allowlist stop before commit
  or push. Branch changes and symlinks in permitted files also stop the run.
- Claude runs with customizations/MCP disabled, noninteractive deny-on-prompt
  permissions, file tools and a short list of local check/read commands. The
  host owns Git mutations and GitHub writes. Permission denial escalates; the
  runner does not retry with bypass permissions. These are workflow controls,
  not an operating-system sandbox.
- Each Claude phase has a ten-minute timeout (configurable from 30 to 900
  seconds). Checks and network commands have independent timeouts. Review
  polling has a five-minute limit (configurable down to 15 seconds).
- The runner recognizes the listed Qodo bot account names in its source. An
  unknown bot, no response, or a response that cannot establish completed review
  stops for human investigation. A queued or progress message is not success.
  Known busy responses are polled past. Review evidence must identify the
  current SHA through GitHub's review commit field or a hidden commit-URL
  marker. A completed current-head review already present is attributed and
  reused without a duplicate review request; stale or unattributed comments
  do not count. Recognized completion is a `Code Review by Qodo` report or a
  submitted substantive review, followed by the agent's finding assessment.
- The runner retains the ticket, commands, stdout/stderr, agent prompts and
  structured results, review bodies, timestamps, PR and commit evidence. These
  local logs are not automatically published. Review them before sharing.

Exit 0 means `ready_for_human`; exit 2 means `needs_human`. Inspect `result.json`
and `events.jsonl` in the evidence directory. On failure, the worktree, branch,
local edits and any opened PR remain intact. Do not relaunch blindly: inspect
the retained evidence first and choose a fresh run directory and branch only
after deciding how to handle the existing work.

Terminal output is best effort: a closed output pipe does not interrupt the
job or its evidence writes. Final results are saved before the terminal event
is emitted. This does not protect against process termination or filesystem
failure; running the process under a suitable supervisor is still necessary
if it must survive its terminal closing.

## Validation status

Syntax and argument validation can be checked without scheduling a job:

```sh
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("tools/run-ticket.py").read_text())'
python3 tools/run-ticket.py --help
python3 -B -m unittest discover -s tools -p 'test_run_ticket.py' -v
```

The offline regression tests close the stdout pipe of a real child process.
They verify that both a final escalation and an earlier progress event preserve
`result.json`, the actual stop reason, the event log and exit status 2. They
stub the workload and repository lookup, so no agent, timer, Git mutation or
GitHub call runs. These tests reproduced a failure where `BrokenPipeError`
escaped from the escalation logger before the result was saved. That proves
the failure mechanism; it does not establish the exact cause of any historical
run without its process error output. Historical evidence is left intact.
Additional offline tests cover busy/stale/unattributed review filtering,
existing current-head review reuse, progress polling, resume mismatches, and
reuse of the existing checkout/PR with current ticket comments and unchanged
original evidence. They do not establish that live Qodo or Claude is working.

Only an actual trigger/run and its retained evidence demonstrate the Day 4
workflow. Writing or syntax-checking this runner alone does not complete the
challenge. Qodo access and a working Claude subscription session are external
prerequisites; neither is established by a syntax check.
