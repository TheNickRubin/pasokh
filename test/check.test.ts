import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, type CheckResult, type NoteCode } from '../src/check.ts';

// Look-alike and invisible characters, spelled out so a reader can tell them apart.
const ARABIC_YEH = '\u064A';
const ALEF_MAKSURA = '\u0649';
const ARABIC_KAF = '\u0643';
const ZWNJ = '\u200C';
const RLM = '\u200F';
const ZWSP = '\u200B';
const KASRA = '\u0650';
const TATWEEL = '\u0640';
const MADDA_ABOVE = '\u0653';
const PERSIAN_QUESTION_MARK = '؟';
const KEHEH_INITIAL_FORM = '\uFB90';
// "kitab" written in Arabic presentation forms: KAF INITIAL, TEH MEDIAL, ALEF FINAL, BEH ISOLATED.
const KITAB_PRESENTATION_FORMS = '\uFEDB\uFE98\uFE8E\uFE8F';

const MIRAVAM = `می${ZWNJ}روم`; // "I go", spelled with a half-space

function codes(result: CheckResult): NoteCode[] {
  return result.notes.map((note) => note.code);
}

function assertAccepted(typed: string, key: string | string[], expected: NoteCode[]): CheckResult {
  const result = checkAnswer(typed, key);
  assert.equal(result.verdict, 'accepted');
  assert.deepEqual(codes(result), expected);
  return result;
}

describe('exact', () => {
  it('matches identical text', () => {
    assert.deepEqual(checkAnswer('کتاب', 'کتاب'), { verdict: 'exact', matched: 'کتاب', notes: [] });
  });

  it('treats decomposed and precomposed alef madda as the same text', () => {
    assert.equal(checkAnswer(`ا${MADDA_ABOVE}ب`, 'آب').verdict, 'exact');
  });

  it('ignores surrounding and repeated whitespace', () => {
    assert.equal(checkAnswer('  سلام    دوست ', 'سلام دوست').verdict, 'exact');
  });

  it('is exact when the learner types the half-space the key uses', () => {
    assert.equal(checkAnswer(MIRAVAM, MIRAVAM).verdict, 'exact');
  });
});

describe('wrong', () => {
  it('rejects a different word', () => {
    assert.deepEqual(checkAnswer('کباب', 'کتاب'), { verdict: 'wrong', matched: null, notes: [] });
  });

  it('rejects an empty answer', () => {
    assert.equal(checkAnswer('', 'کتاب').verdict, 'wrong');
    assert.equal(checkAnswer(`  ${ZWNJ} `, 'کتاب').verdict, 'wrong');
  });

  it('does not treat alef and alef madda as the same letter', () => {
    assert.equal(checkAnswer('اب', 'آب').verdict, 'wrong');
  });

  it('does not let the kaf rule touch gaf', () => {
    assert.equal(checkAnswer('کل', 'گل').verdict, 'wrong');
  });

  it('does not merge Persian letters with their Arabic base shapes', () => {
    assert.equal(checkAnswer('با', 'پا').verdict, 'wrong');
    assert.equal(checkAnswer('زاله', 'ژاله').verdict, 'wrong');
    assert.equal(checkAnswer('جای', 'چای').verdict, 'wrong');
  });

  it('keeps punctuation inside the answer significant', () => {
    assert.equal(checkAnswer('سلام، دوست', 'سلام دوست').verdict, 'wrong');
    assert.equal(checkAnswer(`سلام${ZWNJ}،${ZWNJ}دوست`, 'سلام دوست').verdict, 'wrong');
  });
});

describe('accepted', () => {
  it('forgives Arabic yeh', () => {
    assertAccepted(`باز${ARABIC_YEH}`, 'بازی', ['arabic-yeh']);
  });

  it('forgives alef maksura typed for a final yeh', () => {
    assertAccepted(`باز${ALEF_MAKSURA}`, 'بازی', ['arabic-yeh']);
  });

  it('forgives Arabic kaf', () => {
    assertAccepted(`${ARABIC_KAF}تاب`, 'کتاب', ['arabic-kaf']);
  });

  it('reports every rule it needed, in a stable order', () => {
    assertAccepted(`${ARABIC_KAF}${ARABIC_YEH}`, 'کی', ['arabic-yeh', 'arabic-kaf']);
  });

  it('ignores short-vowel marks typed by the learner', () => {
    assertAccepted(`ک${KASRA}تاب`, 'کتاب', ['diacritics']);
  });

  it('ignores short-vowel marks that only the answer key has', () => {
    assertAccepted('کتاب', `ک${KASRA}تاب`, ['diacritics']);
  });

  it('ignores tatweel', () => {
    assertAccepted(`کت${TATWEEL.repeat(3)}اب`, 'کتاب', ['tatweel']);
  });

  it('compares Persian, Arabic-Indic and ASCII digits by value', () => {
    assertAccepted('\u06F2\u06F0', '20', ['digits']);
    assertAccepted('\u0662\u0660', '\u06F2\u06F0', ['digits']);
  });

  it('ignores punctuation at the edges', () => {
    assertAccepted('سلام!', 'سلام', ['punctuation']);
    assertAccepted('«سلام»', 'سلام', ['punctuation']);
    assertAccepted(`چطوری${PERSIAN_QUESTION_MARK}`, 'چطوری', ['punctuation']);
  });

  it('ignores edge punctuation surrounded by half-spaces in either answer', () => {
    for (const variant of [
      `سلام،${ZWNJ}`,
      `${ZWNJ}،سلام`,
      `${ZWNJ}«${ZWNJ}سلام${ZWNJ}»${ZWNJ}،${ZWNJ}`,
    ]) {
      assertAccepted(variant, 'سلام', ['punctuation', 'spacing']);
      assertAccepted('سلام', variant, ['punctuation', 'spacing']);
    }
  });

  it('attributes edge punctuation and half-spaces only to the needed rules', () => {
    assertAccepted(`سلام،${ZWNJ}`, `سلام${ZWNJ}`, ['punctuation']);
    assertAccepted(`${ZWNJ}،سلام`, `${ZWNJ}سلام`, ['punctuation']);
    assertAccepted(`سلام${ZWNJ}`, 'سلام', ['spacing']);
    assertAccepted(`${ZWNJ}سلام`, 'سلام', ['spacing']);
  });

  it('accepts a space or no break where the key has a half-space, with a spacing note', () => {
    assertAccepted('می روم', MIRAVAM, ['spacing']);
    assertAccepted('میروم', MIRAVAM, ['spacing']);
  });

  it('ignores invisible formatting characters', () => {
    assertAccepted(`کت${RLM}اب`, 'کتاب', ['invisible-marks']);
    assertAccepted(`کت${ZWSP}اب`, 'کتاب', ['invisible-marks']);
  });

  it('reads Persian presentation forms as standard letters', () => {
    assertAccepted(`${KEHEH_INITIAL_FORM}تاب`, 'کتاب', ['compatibility-forms']);
  });

  it('reads Arabic presentation forms, then forgives the Arabic kaf they produce', () => {
    assertAccepted(KITAB_PRESENTATION_FORMS, 'کتاب', ['compatibility-forms', 'arabic-kaf']);
  });

  it('still accepts when only the answer key uses an Arabic variant', () => {
    assertAccepted('بازی', `باز${ARABIC_YEH}`, ['arabic-yeh']);
  });

  it('gives every note a learner-facing message', () => {
    const result = assertAccepted('میروم', MIRAVAM, ['spacing']);
    const message = result.notes[0]?.message ?? '';
    assert.match(message, /half-space/);
    assert.ok(message.includes(MIRAVAM), 'spacing note shows a correctly spelled example');
  });
});

describe('answer keys', () => {
  it('rejects symbol-only and combining-mark-only keys before any match', () => {
    for (const key of ['💥', '+', '\u0653']) {
      assert.throws(() => checkAnswer(key, key), TypeError);
      assert.throws(() => checkAnswer('کتاب', ['کتاب', key]), TypeError);
    }
  });

  it('keeps letters and numbers valid after normalization', () => {
    for (const key of ['کتاب', '20', '\u06F2\u06F0', '\uFB90']) {
      assert.equal(checkAnswer(key, key).verdict, 'exact');
    }
  });
  it('returns an exact match from any position in the key', () => {
    assert.deepEqual(checkAnswer('کتاب', ['کباب', 'کتاب']), { verdict: 'exact', matched: 'کتاب', notes: [] });
  });

  it('prefers an exact match over an earlier accepted one', () => {
    const result = checkAnswer('کتاب', [`${ARABIC_KAF}تاب`, 'کتاب']);
    assert.equal(result.verdict, 'exact');
    assert.equal(result.matched, 'کتاب');
  });

  it('prefers the accepted match that needed the fewest rules', () => {
    const result = assertAccepted(`${ARABIC_KAF}تاب`, [`ک${KASRA}تاب`, 'کتاب'], ['arabic-kaf']);
    assert.equal(result.matched, 'کتاب');
  });

  it('breaks ties by key order', () => {
    const result = assertAccepted('میروم', ['می روم', MIRAVAM], ['spacing']);
    assert.equal(result.matched, 'می روم');
  });

  it('rejects an empty or meaningless answer key as a content bug', () => {
    assert.throws(() => checkAnswer('کتاب', []), TypeError);
    assert.throws(() => checkAnswer('کتاب', PERSIAN_QUESTION_MARK), TypeError);
    assert.throws(() => checkAnswer('کتاب', '   '), TypeError);
    assert.throws(() => checkAnswer('کتاب', ['کتاب', '']), TypeError);
    assert.throws(() => checkAnswer('کتاب', `${ZWNJ}،${ZWNJ}`), TypeError);
  });
});
