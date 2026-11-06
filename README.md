# pasokh

**پاسخ** means "answer". pasokh is a small, dependency-free TypeScript library for checking a learner's typed Persian answer against an answer key. It forgives the differences that come from keyboards and writing conventions, refuses the ones that change the word, and tells the learner what it forgave.

## Who it helps

- People learning Persian who type on whatever keyboard they have: an Arabic layout, a phone without a half-space key, or text pasted from a PDF.
- People building Persian practice apps who need a checker that is strict where it matters, lenient where it does not, and able to explain itself.

## Status

Built during the [Qodo Software Factory Hackathon](https://hackathon.qodo.ai/) (November 2026), one reviewed pull request at a time.

## Usage

```ts
import { checkAnswer } from './src/check.ts';

checkAnswer('كتاب', 'کتاب');
// {
//   verdict: 'accepted',
//   matched: 'کتاب',
//   notes: [{ code: 'arabic-kaf', message: 'Arabic kaf (ك) was read as Persian ک. Persian spelling uses ک.' }]
// }
```

The answer key can be one string or a list of acceptable answers. There are three verdicts:

| Verdict | Meaning |
|---|---|
| `exact` | Same text, ignoring Unicode composition and extra whitespace. |
| `accepted` | Same answer once the variants below are forgiven. `notes` says which ones were needed. |
| `wrong` | Different letters, so a different answer. |

An empty or meaningless answer key throws a `TypeError`: that is a content bug, not a learner mistake.

From the command line (exit status 0 for exact or accepted, 1 for wrong, 2 for usage errors):

```sh
npm run -s pasokh -- 'كتاب' 'کتاب'
npm run -s pasokh -- --json 'میروم' 'می‌روم'
npm run -s pasokh -- --help
```

`--help` prints the usage text to stdout and exits 0, with nothing on stderr. It
is a help request only when it is the sole argument: `pasokh --help`. That is the
only invocation whose result changed; before, a lone `--help` was one answer and
so a usage error. In every other invocation `--help` is still an ordinary answer,
as it always was:

```sh
npm run -s pasokh -- --help --help          # plain-text exact, not help
npm run -s pasokh -- --help 'کتاب' 'کتاب'   # verdict: wrong, exit 1
npm run -s pasokh -- --json --help          # one answer: usage error, exit 2
```

Missing answers are still a usage error: the same usage text goes to stderr,
stdout stays empty and the exit status is 2.

Use the CLI's `--` marker to keep option-like answers literal. The first marker
below belongs to npm; the second belongs to pasokh:

```sh
npm run -s pasokh -- -- '--json' '--json'          # plain-text exact
npm run -s pasokh -- --json -- '--json' '--json'   # JSON exact
npm run -s pasokh -- -- '--help' '--help'          # plain-text exact, not help
```

Everything after pasokh's first `--` is an answer operand, including further
`--json`, `--help` or `--` tokens. Invalid answer keys still produce a content error.

Compatibility note: the first bare `--` is now consumed as syntax. For example,
`pasokh -- X X` compares `X` with `X`; older versions compared the literal `--`
with the answer keys. To type a literal `--`, place it after the delimiter,
as in `pasokh -- -- X`. Invocations without the new marker keep their behavior.

## What it forgives, and what it does not

| Forgiven | Example | Note code |
|---|---|---|
| Presentation and compatibility forms from copied text | U+FB90 KEHEH INITIAL FORM read as ک | `compatibility-forms` |
| Invisible formatting characters | RLM, zero-width space, BOM | `invisible-marks` |
| Arabic yeh and alef maksura | ي or ى read as ی | `arabic-yeh` |
| Arabic kaf | ك read as ک | `arabic-kaf` |
| Short-vowel marks (harakat, shadda, superscript alef) | کِتاب matches کتاب | `diacritics` |
| Tatweel | کتـــاب matches کتاب | `tatweel` |
| Digits by value | Persian ۲۰, Arabic-Indic ٢٠ and 20 | `digits` |
| Punctuation at the start or end | سلام! matches سلام | `punctuation` |
| Space, half-space (ZWNJ) or no break | می روم and میروم match می‌روم | `spacing` |

Not forgiven, on purpose:

- **Different letters stay different.** آ and ا, گ and ک, پ and ب, ژ and ز, چ and ج. Merging them would accept a different word.
- **Punctuation inside the answer** is significant.
- **Not yet handled:** hamza spelling variants (پائیز and پاییز), the ezafe hamza (خانهٔ), teh marbuta, Latin transliteration (Finglish). Each needs an explicit decision and tests before it becomes a rule.

## Requirements

Node.js 22.18 or newer. The source is TypeScript run directly by Node (type stripping), so there is no build step.

```sh
npm install
npm test
npm run typecheck
```
