# pasokh

**پاسخ** means "answer". pasokh is a small, dependency-free TypeScript library for checking a learner's typed Persian answer against an answer key. It forgives the differences that come from keyboards and writing conventions, refuses the ones that change the word, and tells the learner what it forgave.

## Who it helps

- People learning Persian who type on whatever keyboard they have: an Arabic layout, a phone without a half-space key, or text pasted from a PDF.
- People building Persian practice apps who need a checker that is strict where it matters, lenient where it does not, and able to explain itself.

## Status

Built during the [Qodo Software Factory Hackathon](https://hackathon.qodo.ai/) (November 2026), one reviewed pull request at a time.

## Requirements

Node.js 22.18 or newer. The source is TypeScript run directly by Node (type stripping), so there is no build step.

```sh
npm install
npm test
npm run typecheck
```
