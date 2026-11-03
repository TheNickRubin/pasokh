#!/usr/bin/env node
import { checkAnswer } from './check.ts';

const USAGE = `usage: pasokh [--json] <typed answer> <accepted answer> [more accepted answers...]

Exit status: 0 exact or accepted, 1 wrong, 2 usage error.`;

function main(argv: readonly string[]): number {
  const json = argv.includes('--json');
  const args = argv.filter((arg) => arg !== '--json');
  const [typed, ...answerKey] = args;
  if (typed === undefined || answerKey.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  let result;
  try {
    result = checkAnswer(typed, answerKey);
  } catch (error) {
    process.stderr.write(`pasokh: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const lines = [`verdict: ${result.verdict}`];
    if (result.matched !== null) lines.push(`matched: ${result.matched}`);
    if (result.notes.length > 0) {
      lines.push('forgiven:');
      for (const note of result.notes) lines.push(`  - ${note.message}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  return result.verdict === 'wrong' ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
