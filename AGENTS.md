# pasokh: guide for coding agents

pasokh (پاسخ, "answer") checks a learner's typed Persian answer against an answer key. Correctness here is about language, not just code: a rule that forgives too much teaches the learner something false.

## Working rules

- One capability per pull request. The PR description says what changed and how it was verified.
- Run `npm test` and `npm run typecheck` before opening a PR, and paste the result into the PR.
- Every forgiveness rule needs three things: a test showing it forgives, a test showing it does not over-forgive a neighbouring letter, and a learner-facing note.
- Never silently treat two distinct Persian letters as the same (for example آ and ا, گ and ک, پ and ب). A new equivalence needs an explicit decision in the README.
- Write look-alike and invisible characters as `\uXXXX` escapes in source and tests (Arabic ي and Persian ی look identical in most fonts; ZWNJ is invisible). Plain Persian words may be written directly.
- No runtime dependencies without a written reason.
