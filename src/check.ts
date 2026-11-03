/**
 * Check a learner's typed Persian answer against an answer key.
 *
 * Three verdicts:
 * - exact: the same text, ignoring Unicode composition and surrounding or repeated whitespace.
 * - accepted: the same answer once keyboard and writing-convention variants are forgiven;
 *   `notes` lists each forgiveness that was needed for the match.
 * - wrong: different letters, so a different answer.
 */

export type Verdict = 'exact' | 'accepted' | 'wrong';

export type NoteCode =
  | 'compatibility-forms'
  | 'invisible-marks'
  | 'arabic-yeh'
  | 'arabic-kaf'
  | 'diacritics'
  | 'tatweel'
  | 'digits'
  | 'punctuation'
  | 'spacing';

export interface Note {
  readonly code: NoteCode;
  readonly message: string;
}

export interface CheckResult {
  readonly verdict: Verdict;
  /** The answer-key entry that matched, or null when the verdict is wrong. */
  readonly matched: string | null;
  /** Forgiveness rules that were needed for an accepted match. Always empty for exact and wrong. */
  readonly notes: readonly Note[];
}

interface Step {
  readonly code: NoteCode;
  readonly message: string;
  readonly apply: (text: string) => string;
}

// Format characters that never change the meaning of an answer: soft hyphen, Arabic letter mark,
// zero-width space, zero-width joiner, LRM/RLM, bidi embeddings and isolates, word joiner, BOM.
// ZWNJ (U+200C) is deliberately absent: it is part of Persian spelling and is handled by the spacing step.
const INVISIBLE = /[\u00AD\u061C\u200B\u200D\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
// U+0649 ARABIC LETTER ALEF MAKSURA and U+064A ARABIC LETTER YEH.
const ARABIC_YEH = /[\u0649\u064A]/g;
const PERSIAN_YEH = '\u06CC';
// U+0643 ARABIC LETTER KAF.
const ARABIC_KAF = /\u0643/g;
const PERSIAN_KAF = '\u06A9';
// U+064B..U+0652 (fathatan to sukun, including shadda) and U+0670 superscript alef.
// Madda and hamza (U+0653..U+0655) are not included: they distinguish letters such as alef madda (U+0622).
const HARAKAT = /[\u064B-\u0652\u0670]/g;
const TATWEEL = /\u0640/g;
// Arabic-Indic (U+0660..U+0669) and Extended Arabic-Indic, i.e. Persian (U+06F0..U+06F9), digits.
const EASTERN_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/g;
const EDGE_PUNCTUATION = /^[\p{P}\s]+|[\p{P}\s]+$/gu;
const SEPARATORS = /[\s\u200C]/gu;
const WHITESPACE_RUN = /\s+/gu;

function toAsciiDigits(text: string): string {
  return text.replace(EASTERN_DIGIT, (digit) => {
    const codePoint = digit.codePointAt(0) ?? 0;
    const zero = codePoint >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(codePoint - zero);
  });
}

/** Ordered normalization steps. Each one is a forgiveness rule with a learner-facing note. */
const STEPS: readonly Step[] = [
  {
    code: 'compatibility-forms',
    message: 'Compatibility or presentation forms (common in copied text) were compared as standard letters.',
    apply: (text) => text.normalize('NFKC'),
  },
  {
    code: 'invisible-marks',
    message: 'Invisible formatting characters were ignored.',
    apply: (text) => text.replace(INVISIBLE, ''),
  },
  {
    code: 'arabic-yeh',
    message: 'Arabic yeh (\u064A or \u0649) was read as Persian \u06CC. Persian spelling uses \u06CC.',
    apply: (text) => text.replace(ARABIC_YEH, PERSIAN_YEH),
  },
  {
    code: 'arabic-kaf',
    message: 'Arabic kaf (\u0643) was read as Persian \u06A9. Persian spelling uses \u06A9.',
    apply: (text) => text.replace(ARABIC_KAF, PERSIAN_KAF),
  },
  {
    code: 'diacritics',
    message: 'Short-vowel marks (harakat) are optional in Persian writing and were ignored.',
    apply: (text) => text.replace(HARAKAT, ''),
  },
  {
    code: 'tatweel',
    message: 'The decorative stretching character (tatweel, \u0640) was ignored.',
    apply: (text) => text.replace(TATWEEL, ''),
  },
  {
    code: 'digits',
    message: 'Digits were compared by value, so \u06F2, \u0662 and 2 count as the same.',
    apply: toAsciiDigits,
  },
  {
    code: 'punctuation',
    message: 'Punctuation at the start or end was ignored.',
    apply: (text) => text.replace(EDGE_PUNCTUATION, ''),
  },
  {
    code: 'spacing',
    message:
      'Spacing differs. Check where Persian uses a space, a half-space (ZWNJ) or no break, as in \u0645\u06CC\u200C\u0631\u0648\u0645.',
    apply: (text) => text.replace(SEPARATORS, ''),
  },
];

function tidy(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim();
}

/** The form used for the exact comparison: canonical composition, single spaces, no outer whitespace. */
function canonical(text: string): string {
  return tidy(text.normalize('NFC'));
}

/** Run every step in order, optionally skipping one, and return the comparison key. */
function comparisonKey(text: string, skip?: NoteCode): string {
  let current = canonical(text);
  for (const step of STEPS) {
    if (step.code !== skip) current = tidy(step.apply(current));
  }
  return current;
}

function wrong(): CheckResult {
  return { verdict: 'wrong', matched: null, notes: [] };
}

function compare(typed: string, key: string): CheckResult {
  if (canonical(typed) === canonical(key)) {
    return { verdict: 'exact', matched: key, notes: [] };
  }
  if (comparisonKey(typed) !== comparisonKey(key)) {
    return wrong();
  }
  // A step earns a note when the match fails without it, i.e. it was needed to forgive a difference.
  const notes = STEPS.filter((step) => comparisonKey(typed, step.code) !== comparisonKey(key, step.code)).map(
    ({ code, message }) => ({ code, message }),
  );
  return { verdict: 'accepted', matched: key, notes };
}

/**
 * Check `typed` against one or more acceptable answers.
 *
 * Returns the first exact match if there is one; otherwise the accepted match that needed the
 * fewest forgiveness rules (earliest key on a tie); otherwise a wrong verdict.
 *
 * Throws a TypeError when the answer key is empty or an entry has no letters or digits left after
 * normalization, because that is a content bug, not a learner mistake.
 */
export function checkAnswer(typed: string, answerKey: string | readonly string[]): CheckResult {
  if (typeof typed !== 'string') {
    throw new TypeError('typed answer must be a string');
  }
  const keys: readonly string[] = typeof answerKey === 'string' ? [answerKey] : answerKey;
  if (keys.length === 0) {
    throw new TypeError('answer key must contain at least one answer');
  }
  for (const key of keys) {
    if (typeof key !== 'string' || comparisonKey(key) === '') {
      throw new TypeError(`answer key entry ${JSON.stringify(key)} is empty after normalization`);
    }
  }

  let best: CheckResult | null = null;
  for (const key of keys) {
    const result = compare(typed, key);
    if (result.verdict === 'exact') return result;
    if (result.verdict === 'accepted' && (best === null || result.notes.length < best.notes.length)) {
      best = result;
    }
  }
  return best ?? wrong();
}
