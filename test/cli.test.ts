import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const ARABIC_KAF = '\u0643';

function pasokh(...args: string[]) {
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], {
    encoding: 'utf8',
  });
}

describe('cli', () => {
  describe('--help', () => {
    it('prints the usage text to stdout, exits 0 and leaves stderr empty', () => {
      const run = pasokh('--help');
      assert.equal(run.status, 0);
      assert.match(run.stdout, /^usage: pasokh/);
      assert.match(run.stdout, /^ {2}--help {2}/m);
      assert.match(run.stdout, /^ {2}--json {2}/m);
      assert.match(run.stdout, /^Exit status: /m);
      assert.match(run.stdout, /[^\n]\n$/);
      assert.equal(run.stderr, '');
    });

    it('prints exactly the text that a usage error sends to stderr', () => {
      const help = pasokh('--help');
      const usageError = pasokh();
      assert.equal(usageError.status, 2);
      assert.equal(usageError.stdout, '');
      assert.equal(help.stdout, usageError.stderr);
    });

    it('wins over --json in either order and prints plain text, not JSON', () => {
      for (const args of [
        ['--json', '--help'],
        ['--help', '--json'],
      ]) {
        const run = pasokh(...args);
        const label = args.join(' ');
        assert.equal(run.status, 0, label);
        assert.match(run.stdout, /^usage: pasokh/, label);
        assert.throws(() => JSON.parse(run.stdout), label);
        assert.equal(run.stderr, '', label);
      }
    });

    it('wins over answers given before the delimiter', () => {
      const run = pasokh('--help', 'کتاب', 'کباب');
      assert.equal(run.status, 0);
      assert.match(run.stdout, /^usage: pasokh/);
      assert.doesNotMatch(run.stdout, /^verdict:/m);
      assert.equal(run.stderr, '');
    });

    it('wins over literal operands after the delimiter', () => {
      const run = pasokh('--help', '--', '--json', '--json');
      assert.equal(run.status, 0);
      assert.match(run.stdout, /^usage: pasokh/);
      assert.doesNotMatch(run.stdout, /^verdict:/m);
      assert.equal(run.stderr, '');
    });

    it('compares literal --help operands after the delimiter as plain-text exact', () => {
      const run = pasokh('--', '--help', '--help');
      assert.equal(run.status, 0);
      assert.equal(run.stdout, 'verdict: exact\nmatched: --help\n');
      assert.equal(run.stderr, '');
    });

    it('compares literal --help operands after the delimiter as JSON exact', () => {
      const run = pasokh('--json', '--', '--help', '--help');
      assert.equal(run.status, 0);
      assert.deepEqual(JSON.parse(run.stdout), { verdict: 'exact', matched: '--help', notes: [] });
      assert.equal(run.stderr, '');
    });

    it('marks a literal --help wrong against a different literal answer', () => {
      const run = pasokh('--', '--json', '--help');
      assert.equal(run.status, 1);
      assert.equal(run.stdout, 'verdict: wrong\n');
      assert.equal(run.stderr, '');
    });

    it('does not treat a lone --help after the delimiter as a help request', () => {
      const run = pasokh('--', '--help');
      assert.equal(run.status, 2);
      assert.equal(run.stdout, '');
      assert.match(run.stderr, /^usage: pasokh/);
    });

    it('keeps missing operands a usage error without --help', () => {
      for (const args of [[], ['--json'], ['کتاب'], ['--json', '--'], ['--', 'کتاب']]) {
        const run = pasokh(...args);
        const label = `pasokh ${args.join(' ')}`;
        assert.equal(run.status, 2, label);
        assert.equal(run.stdout, '', label);
        assert.match(run.stderr, /^usage: pasokh/, label);
      }
    });
  });

  it('consumes the first bare delimiter before ordinary operands', () => {
    const run = pasokh('--', 'X', 'X');
    assert.equal(run.status, 0);
    assert.equal(run.stdout, 'verdict: exact\nmatched: X\n');
    assert.equal(run.stderr, '');
  });
  it('preserves literal --json answers after the option delimiter', () => {
    const run = pasokh('--', '--json', '--json');
    assert.equal(run.status, 0);
    assert.equal(run.stdout, 'verdict: exact\nmatched: --json\n');
    assert.equal(run.stderr, '');
  });

  it('allows JSON mode before the delimiter with literal option-like answers', () => {
    const run = pasokh('--json', '--', '--json', '--json');
    assert.equal(run.status, 0);
    assert.deepEqual(JSON.parse(run.stdout), { verdict: 'exact', matched: '--json', notes: [] });
    assert.equal(run.stderr, '');
  });

  it('preserves later delimiters as literal operands', () => {
    const run = pasokh('--', '--', '--');
    assert.equal(run.status, 2);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /^pasokh: answer key entry/);
  });

  it('still requires two operands after the delimiter', () => {
    const run = pasokh('--json', '--', '--json');
    assert.equal(run.status, 2);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /^usage: pasokh/);
  });
  it('reports a symbol-only key as a content error, not a verdict', () => {
    const run = pasokh('--json', '💥', '💥');
    assert.equal(run.status, 2);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /^pasokh: answer key entry/);
  });
  it('prints an accepted verdict with what it forgave and exits 0', () => {
    const run = pasokh(`${ARABIC_KAF}تاب`, 'کتاب');
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^verdict: accepted$/m);
    assert.match(run.stdout, /^matched: کتاب$/m);
    assert.match(run.stdout, /^forgiven:$/m);
    assert.equal(run.stderr, '');
  });

  it('prints an exact verdict without a forgiven section', () => {
    const run = pasokh('کتاب', 'کتاب');
    assert.equal(run.status, 0);
    assert.match(run.stdout, /^verdict: exact$/m);
    assert.doesNotMatch(run.stdout, /forgiven/);
  });

  it('exits 1 for a wrong answer', () => {
    const run = pasokh('کباب', 'کتاب');
    assert.equal(run.status, 1);
    assert.equal(run.stdout, 'verdict: wrong\n');
  });

  it('accepts several answers and emits JSON on request', () => {
    const run = pasokh('--json', `${ARABIC_KAF}تاب`, 'کباب', 'کتاب');
    assert.equal(run.status, 0);
    const result = JSON.parse(run.stdout);
    assert.equal(result.verdict, 'accepted');
    assert.equal(result.matched, 'کتاب');
    assert.deepEqual(
      result.notes.map((note: { code: string }) => note.code),
      ['arabic-kaf'],
    );
  });

  it('exits 2 with usage when arguments are missing', () => {
    const run = pasokh('کتاب');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /^usage: pasokh/);
  });

  it('exits 2 when the answer key is meaningless', () => {
    const run = pasokh('کتاب', '؟');
    assert.equal(run.status, 2);
    assert.match(run.stderr, /^pasokh: answer key entry/);
  });
});
