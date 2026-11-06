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

## Bounds and evidence

- One issue and one new `day-04/` branch. No batch ticket selection.
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
- The runner retains the ticket, commands, stdout/stderr, agent prompts and
  structured results, review bodies, timestamps, PR and commit evidence. These
  local logs are not automatically published. Review them before sharing.

Exit 0 means `ready_for_human`; exit 2 means `needs_human`. Inspect `result.json`
and `events.jsonl` in the evidence directory. On failure, the worktree, branch,
local edits and any opened PR remain intact. Do not relaunch blindly: inspect
the retained evidence first and choose a fresh run directory and branch only
after deciding how to handle the existing work.

## Validation status

Syntax and argument validation can be checked without scheduling a job:

```sh
python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("tools/run-ticket.py").read_text())'
python3 tools/run-ticket.py --help
```

Only an actual trigger/run and its retained evidence demonstrate the Day 4
workflow. Writing or syntax-checking this runner alone does not complete the
challenge. Qodo access and a working Claude subscription session are external
prerequisites; neither is established by a syntax check.
