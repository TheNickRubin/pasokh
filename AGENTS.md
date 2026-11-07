# AGENTS.md: pasokh house rules

## What we're building

pasokh (پاسخ, "answer") checks a learner's typed Persian answer against an answer key. It returns `exact`, `accepted` (with a learner-facing note for every variant it forgave) or `wrong`. It forgives what keyboards and writing conventions cause, such as Arabic ي instead of Persian ی or a space instead of a half-space. It refuses anything that changes the word.

Correctness here is about language as much as code. A rule that forgives too much teaches the learner a false spelling.

## Setup and verification

Node.js 22.18 or newer. TypeScript runs directly under Node (type stripping), so there is no build step.

```sh
npm install         # dev tooling only; there are no runtime dependencies
npm test            # node:test suites in test/, including the source-hygiene scan
npm run typecheck   # strict tsc, no emit
npm run -s pasokh -- 'كتاب' 'کتاب'   # CLI smoke test: expect "verdict: accepted"
```

A change is done when `npm test` and `npm run typecheck` both pass, and the PR description shows their output.

## Project rules

### 1. The Show the Invisible rule

- **Rule:** In `.ts` files, write look-alike and invisible characters as `\uXXXX` escapes, never raw. This covers Arabic yeh, alef maksura and kaf, ZWNJ and the other zero-width and direction marks, tatweel, harakat, Arabic-Indic and Persian digits, and presentation forms. Plain Persian words in canonical letters may be written directly.
- **Where:** every file under `src/` and `test/`. `test/source-hygiene.test.ts` enforces it, so `npm test` fails on a violation.
- **Why:** Arabic ي and Persian ی render identically in most fonts, and ZWNJ is invisible. A reviewer, human or AI, cannot see the difference between a correct rule and a broken one. On Day 1 our own tooling silently turned every escape into a raw character; a byte-level scan caught it, and eyes did not.

### 2. The No Silent Twins rule

- **Rule:** Never treat two distinct Persian letters as the same, for example آ and ا, گ and ک, پ and ب, ژ and ز, چ and ج. A new equivalence needs a written decision in the README's "What it forgives" section, plus tests in both directions.
- **Where:** `src/check.ts`, especially the `STEPS` list and its regular expressions, and any future normalization code.
- **Why:** آب (water) and اب are different words. A checker that merges them accepts a wrong answer and teaches a false spelling. Exactly this bug shipped in another Persian practice app I maintain.

### 3. The Every Forgiveness Explains Itself rule

- **Rule:** Every forgiveness rule ships with three things: a learner-facing note, a test showing it forgives, and a test showing it does not over-forgive a neighbouring letter, such as kaf versus gaf.
- **Where:** each entry in `STEPS` in `src/check.ts`, and `test/check.test.ts`.
- **Why:** An `accepted` verdict without a reason teaches nothing. An untested forgiveness rule is how twins get merged.

### 4. The Loud Answer Key rule

- **Rule:** An empty or meaningless answer key, such as blank or punctuation-only, throws a `TypeError`. It never returns `wrong`.
- **Where:** `checkAnswer` in `src/check.ts`, and any future function that accepts answer keys.
- **Why:** A broken key is a content bug. Silently marking every learner wrong destroys their trust and hides the bug from the author.

### 5. The One Capability, With Receipts rule

- **Rule:** One capability per pull request. The PR description states what changed, why, and the verification commands with their output.
- **Where:** every pull request.
- **Why:** A focused diff gets a focused review, and receipts let a reviewer check claims instead of trusting them.

### 6. Review the Live Revision

- **Rule:** Before automation reports `ready_for_human`, verify that the PR is open and its live head SHA matches the tested commit and a completed, investigated Qodo review explicitly attributed to that SHA. Recheck the live PR after waiting for review and immediately before reporting readiness. If the live head unexpectedly differs from the revision being checked, stop for human help; continuing with a new head requires checks and review for that head. Pending, failed, stale or unattributed review remains incomplete: wait only within the configured limits, then stop for help. A ready result leaves the merge decision to a human.
- **Where:** Automated PR review/fix workflows and their regression tests. Cover stale review evidence and a PR head changing during a run.
- **Why:** [Qodo found two ways an old review could clear newer code](https://github.com/TheNickRubin/pasokh/pull/7#issuecomment-6675168248): an updated comment without commit attribution, and a remote PR changing while the local checkout stayed unchanged. Verification receipts are useful only for the revision they actually checked.

## Review guidance

These matter most here: rules 1 to 4, Unicode correctness (normalization order, code point ranges, regex flags), and whether a test would catch the bug it claims to cover.

These are not a concern in this project, so please do not flag them:

- Micro-performance: inputs are single answers of a few dozen characters.
- Translating CLI or note messages: English learner notes are intended for now.
- Adding runtime dependencies for Unicode handling: built-in `String.prototype.normalize` and regex property escapes are deliberate.
