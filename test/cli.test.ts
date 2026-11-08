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
