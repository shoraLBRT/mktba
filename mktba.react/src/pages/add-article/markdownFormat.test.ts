import { describe, expect, it } from 'vitest';
import { applyMarkdownFormat, insertArticleLink } from './markdownFormat';
import { computeEditorStats } from './editorStats';

const snippets = { insertText: 'текст', linkSnippet: 'ссылка', listSnippet: 'пункт', quoteSnippet: 'цитата' };

describe('applyMarkdownFormat', () => {
  it('given a selected word, when made bold, then it is wrapped and stays selected', () => {
    const result = applyMarkdownFormat('один два', 5, 8, 'bold', snippets);

    expect(result).toEqual({ value: 'один **два**', selectionStart: 7, selectionEnd: 10 });
  });

  it('given no selection, when a link is inserted, then the placeholder text is linked and selected', () => {
    const result = applyMarkdownFormat('', 0, 0, 'link', snippets);

    expect(result).toEqual({ value: '[ссылка](https://example.com)', selectionStart: 1, selectionEnd: 7 });
  });

  it('given no selection, when an article link is inserted, then the escaped title is the selected link text', () => {
    const result = insertArticleLink('См. ', 4, 4, { title: 'Намаз [кратко]', href: '/namaz' });

    expect(result).toEqual({ value: 'См. [Намаз \\[кратко\\]](/namaz)', selectionStart: 5, selectionEnd: 21 });
  });

  it('given a selected word, when an article link is inserted, then the word links to the article', () => {
    const result = insertArticleLink('о намазе тут', 2, 8, { title: 'Намаз', href: '/namaz' });

    expect(result).toEqual({ value: 'о [намазе](/namaz) тут', selectionStart: 3, selectionEnd: 9 });
  });

  it('given two selected lines, when made an ordered list, then each line is numbered', () => {
    const result = applyMarkdownFormat('а\nб', 0, 3, 'orderedList', snippets);

    expect(result.value).toBe('1. а\n2. б');
  });

  it('given a footnote reference and its definition, when another is inserted, then it is numbered after both marks and defined at the end', () => {
    const result = applyMarkdownFormat('x[^1]\n[^1]: a', 1, 1, 'footnote', snippets);

    expect(result.value).toBe('x[^3][^1]\n[^1]: a\n[^3]: ');
    expect(result.selectionStart).toBe(5);
  });
});

describe('computeEditorStats', () => {
  it('given an empty draft, when counted, then there is no reading time', () => {
    const stats = computeEditorStats([{ id: 'b1', kind: 'paragraph', content: '', sources: [] }], '');

    expect(stats).toEqual({ blockCount: 1, paragraphCount: 0, characterCount: 0, wordCount: 0, readingTimeMinutes: 0 });
  });

  it('given a short text, when counted, then it takes at least a minute', () => {
    const stats = computeEditorStats([{ id: 'b1', kind: 'paragraph', content: 'два слова', sources: [] }], 'два слова');

    expect(stats.paragraphCount).toBe(1);
    expect(stats.wordCount).toBe(2);
    expect(stats.readingTimeMinutes).toBe(1);
  });
});
