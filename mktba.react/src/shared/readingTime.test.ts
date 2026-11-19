import { describe, expect, it } from 'vitest';
import { countWords, estimateReadingMinutes, READING_WORDS_PER_MINUTE } from './readingTime';

const words = (count: number) => Array.from({ length: count }, () => 'слово').join(' ');

describe('countWords', () => {
  it('given markdown with a heading, a link, an image and a code fence, when counted, then only the visible words count', () => {
    const markdown = '## Условия намаза\n\nСм. [малое омовение](/article/wudu-long-slug) и ![схема](/a/b/c.png)\n\n```\nlet x = 1\n```';

    expect(countWords(markdown)).toBe(7);
  });

  it('given Arabic text and a hyphenated word, when counted, then each word counts once', () => {
    expect(countWords('الصلاة عماد الدين — из-за этого')).toBe(5);
  });

  it('given only markup, when counted, then there are no words', () => {
    expect(countWords('---\n\n> \n\n***')).toBe(0);
  });
});

describe('estimateReadingMinutes', () => {
  it('given no text at all, when estimated, then there is no estimate', () => {
    expect(estimateReadingMinutes([])).toBeNull();
    expect(estimateReadingMinutes(['', '  '])).toBeNull();
  });

  it('given a few words, when estimated, then it is one minute', () => {
    expect(estimateReadingMinutes(['Короткий абзац'])).toBe(1);
  });

  it('given exactly a minute of words, when estimated, then it is one minute, and one word more makes two', () => {
    expect(estimateReadingMinutes([words(READING_WORDS_PER_MINUTE)])).toBe(1);
    expect(estimateReadingMinutes([words(READING_WORDS_PER_MINUTE), 'ещё'])).toBe(2);
  });
});
