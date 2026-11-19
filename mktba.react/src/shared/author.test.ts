import { describe, expect, it } from 'vitest';
import { authorHref, authorInitial, authorMetaDescription, authorPageCount, authorPageHref, readAuthorPage } from './author';

describe('author page addresses', () => {
  it('given a slug, when building links, then page 1 is the author page itself and later pages carry the parameter', () => {
    expect(authorHref('ivan-ivanov')).toBe('/authors/ivan-ivanov');
    expect(authorPageHref('ivan-ivanov', 1)).toBe('/authors/ivan-ivanov');
    expect(authorPageHref('ivan-ivanov', 3)).toBe('/authors/ivan-ivanov?page=3');
  });

  it.each([
    ['page=2', 2],
    ['', 1],
    ['page=0', 1],
    ['page=-4', 1],
    ['page=1.5', 1],
    ['page=abc', 1],
  ])('given the query "%s", when reading the page, then it is %i', (query, expected) => {
    expect(readAuthorPage(new URLSearchParams(query))).toBe(expected);
  });

  it('given totals, when counting pages, then an empty list still has one page', () => {
    expect(authorPageCount(0, 20)).toBe(1);
    expect(authorPageCount(20, 20)).toBe(1);
    expect(authorPageCount(21, 20)).toBe(2);
  });
});

describe('authorInitial', () => {
  it('given a name, when taking the initial, then it is the first letter in upper case', () => {
    expect(authorInitial('  иван Иванов')).toBe('И');
    expect(authorInitial('')).toBe('');
  });
});

describe('authorMetaDescription', () => {
  it('given no text about the author, when describing the page, then the fallback is used', () => {
    expect(authorMetaDescription(null, 'Запасной текст')).toBe('Запасной текст');
    expect(authorMetaDescription('  \n ', 'Запасной текст')).toBe('Запасной текст');
  });

  it('given a short text on several lines, when describing the page, then it is put on one line', () => {
    expect(authorMetaDescription('Пишу о фикхе.\n\nПреподаю.', 'x')).toBe('Пишу о фикхе. Преподаю.');
  });

  it('given a long text, when describing the page, then it is cut on a word boundary within 160 characters', () => {
    const description = authorMetaDescription('слово '.repeat(60), 'x');

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('слово…')).toBe(true);
  });
});
