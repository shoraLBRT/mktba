import { describe, expect, it } from 'vitest';
import { hasArabic, isArabicOnly, splitArabicRuns } from './arabicText';

describe('arabicText', () => {
  it('given Russian text with an Arabic phrase, when split, then the phrase is one run and the punctuation stays outside', () => {
    const text = 'Сказано: «بسم الله الرحمن الرحيم», и далее.';

    expect(splitArabicRuns(text)).toEqual([
      { text: 'Сказано: «', arabic: false },
      { text: 'بسم الله الرحمن الرحيم', arabic: true },
      { text: '», и далее.', arabic: false },
    ]);
  });

  it('given Arabic words with Arabic punctuation and digits between them, when split, then they stay one run', () => {
    expect(splitArabicRuns('قال، رضي الله عنه (٢) قال')).toEqual([{ text: 'قال، رضي الله عنه (٢) قال', arabic: true }]);
  });

  it('given Arabic with harakat and presentation forms, when split, then every range counts as Arabic', () => {
    expect(splitArabicRuns('a ﷺ b بِسْمِ c ﻻ')).toEqual([
      { text: 'a ', arabic: false },
      { text: 'ﷺ', arabic: true },
      { text: ' b ', arabic: false },
      { text: 'بِسْمِ', arabic: true },
      { text: ' c ', arabic: false },
      { text: 'ﻻ', arabic: true },
    ]);
  });

  it('given text without Arabic, when split, then it is one piece and has no Arabic', () => {
    expect(splitArabicRuns('Только русский.')).toEqual([{ text: 'Только русский.', arabic: false }]);
    expect(hasArabic('Только русский.')).toBe(false);
  });

  it('given an ayah with its reference, when checked, then it is Arabic only; with a Russian word it is not', () => {
    expect(isArabicOnly('﴿ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ﴾ (2:255)')).toBe(true);
    expect(isArabicOnly('اللَّهُ — Аллах')).toBe(false);
    expect(isArabicOnly('(2:255)')).toBe(false);
  });
});
