#!/usr/bin/env node
import { checkAnswer } from './check.ts';

const USAGE = `usage: pasokh [--json] [--] <typed answer> <accepted answer> [more accepted answers...]
       pasokh --help

Options:
  --json  Print the result as JSON.
  --help  Print this usage text to stdout and exit 0. Only as the sole argument.
  --      End of options. Every later argument is an answer, even --json, --help or --.

Exit status: 0 exact or accepted, 1 wrong, 2 usage error.`;

function main(argv: readonly string[]): number {
  // Help is standalone: only `pasokh --help` with no other argument. In every other invocation
  // "--help" stays an ordinary answer operand, exactly as before help existed.
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const delimiter = argv.indexOf('--');
  const optionArgs = delimiter === -1 ? argv : argv.slice(0, delimiter);
  const json = optionArgs.includes('--json');
  const args = [
    ...optionArgs.filter((arg) => arg !== '--json'),
    ...(delimiter === -1 ? [] : argv.slice(delimiter + 1)),
  ];
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
