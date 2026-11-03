// Enforces AGENTS.md rule 1, "Show the Invisible": look-alike and invisible characters must be
// written as escapes in source and tests, never raw. This file uses numeric code points only.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ForbiddenRange {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

const FORBIDDEN: readonly ForbiddenRange[] = [
  { from: 0x00ad, to: 0x00ad, label: 'soft hyphen' },
  { from: 0x061c, to: 0x061c, label: 'Arabic letter mark' },
  { from: 0x0640, to: 0x0640, label: 'tatweel' },
  { from: 0x0643, to: 0x0643, label: 'Arabic kaf' },
  { from: 0x0649, to: 0x064a, label: 'alef maksura or Arabic yeh' },
  { from: 0x064b, to: 0x0655, label: 'harakat, madda or hamza mark' },
  { from: 0x0660, to: 0x0669, label: 'Arabic-Indic digit' },
  { from: 0x0670, to: 0x0670, label: 'superscript alef' },
  { from: 0x06f0, to: 0x06f9, label: 'Persian digit' },
  { from: 0x200b, to: 0x200f, label: 'zero-width character or direction mark (includes ZWNJ)' },
  { from: 0x202a, to: 0x202e, label: 'bidi embedding or override' },
  { from: 0x2060, to: 0x2064, label: 'word joiner or invisible operator' },
  { from: 0x2066, to: 0x2069, label: 'bidi isolate' },
  { from: 0xfb50, to: 0xfdff, label: 'Arabic presentation form' },
  { from: 0xfe70, to: 0xfeff, label: 'Arabic presentation form or byte order mark' },
];

const BACKSLASH = String.fromCharCode(92);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['src', 'test'];

export interface Violation {
  readonly line: number;
  readonly column: number;
  readonly codePoint: number;
  readonly label: string;
}

export function findViolations(text: string): Violation[] {
  const violations: Violation[] = [];
  const lines = text.split('\n');
  lines.forEach((lineText, index) => {
    let column = 0;
    for (const char of lineText) {
      column += 1;
      const codePoint = char.codePointAt(0) ?? 0;
      const range = FORBIDDEN.find((r) => codePoint >= r.from && codePoint <= r.to);
      if (range) violations.push({ line: index + 1, column, codePoint, label: range.label });
    }
  });
  return violations;
}

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function hex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

describe('source hygiene (AGENTS.md rule 1)', () => {
  it('detects a raw Arabic yeh and a raw ZWNJ, and ignores canonical Persian letters', () => {
    const sample = `ok = 'کتاب';\nbad = 'باز${String.fromCodePoint(0x064a)}';\nhidden = 'می${String.fromCodePoint(0x200c)}روم';`;
    const found = findViolations(sample).map((v) => `${v.line}:${v.column}:${hex(v.codePoint)}`);
    assert.deepEqual(found, ['2:11:064A', '3:13:200C']);
  });

  it('finds no raw look-alike or invisible characters in src/ or test/', () => {
    const report = SCANNED_DIRS.flatMap((dir) => tsFiles(join(ROOT, dir))).flatMap((file) =>
      findViolations(readFileSync(file, 'utf8')).map(
        (v) =>
          `${relative(ROOT, file)}:${v.line}:${v.column} raw U+${hex(v.codePoint)} (${v.label}); write it as ${BACKSLASH}u${hex(v.codePoint)}`,
      ),
    );
    assert.deepEqual(report, [], `Raw characters break the Show the Invisible rule:\n${report.join('\n')}`);
  });
});
