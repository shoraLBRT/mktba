import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber, formatPlural, isPluralForms, type PluralForms } from './format';
import { useFormat } from './hooks';
import { LocalizationProvider } from './provider';
import { LANGUAGES, type Language } from './language';

const localeFiles = import.meta.glob<Record<string, unknown>>('./locales/**/*.json', { eager: true, import: 'default' });

const articles: PluralForms = { one: '{count} статья', few: '{count} статьи', many: '{count} статей', other: '{count} статьи' };
const englishArticles: PluralForms = { one: '{count} article', other: '{count} articles' };
// Intl puts a narrow no-break space into Russian thousands and some times; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/gu, ' ');

describe('formatPlural', () => {
  it.each([
    [1, '1 статья'],
    [21, '21 статья'],
    [2, '2 статьи'],
    [24, '24 статьи'],
    [5, '5 статей'],
    [11, '11 статей'],
    [12, '12 статей'],
    [111, '111 статей'],
    [0, '0 статей'],
    [1.5, '1,5 статьи'],
  ])('given %s in Russian, when formatted, then picks the CLDR form: %s', (count, expected) => {
    expect(formatPlural('ru', articles, count)).toBe(expected);
  });

  it.each([
    [1, '1 article'],
    [2, '2 articles'],
    [0, '0 articles'],
    [21, '21 articles'],
  ])('given %s in English, when formatted, then picks one or other: %s', (count, expected) => {
    expect(formatPlural('en', englishArticles, count)).toBe(expected);
  });

  it('given a category the forms lack, when formatted, then falls back to other', () => {
    expect(formatPlural('ru', { other: '{count} шт.' }, 3)).toBe('3 шт.');
  });

  it('given a large count and other parameters, when formatted, then the count is grouped and the rest filled in', () => {
    const forms: PluralForms = { one: '{count} статья в «{tag}»', few: '{count} статьи в «{tag}»', many: '{count} статей в «{tag}»', other: '' };
    expect(plain(formatPlural('ru', forms, 12345, { tag: 'Намаз' }))).toBe('12 345 статей в «Намаз»');
  });
});

describe('formatNumber', () => {
  it('given each language, when formatting, then uses its own separators', () => {
    expect(plain(formatNumber('ru', 12345.5))).toBe('12 345,5');
    expect(formatNumber('en', 12345.5)).toBe('12,345.5');
  });

  it('given options, when formatting, then applies them', () => {
    expect(plain(formatNumber('ru', 0.256, { style: 'percent', maximumFractionDigits: 1 }))).toBe('25,6 %');
  });
});

describe('formatDate', () => {
  it('given a UTC timestamp late in the day, when formatted as a calendar date, then reads as that UTC day', () => {
    expect(formatDate('ru', '2026-11-01T23:30:00Z')).toMatch(/^1 ноября 2026/);
    expect(formatDate('en', '2026-11-01T23:30:00Z')).toBe('November 1, 2026');
  });

  it('given the short style, when formatted, then gives the table date of the language', () => {
    expect(formatDate('ru', '2026-11-01T23:30:00Z', 'short')).toBe('01.11.2026');
    expect(formatDate('en', '2026-11-01T23:30:00Z', 'short')).toBe('11/01/2026');
  });

  it('given a Date, when formatted, then reads the same as its ISO string', () => {
    expect(formatDate('ru', new Date('2026-03-08T00:00:00Z'))).toBe(formatDate('ru', '2026-03-08T00:00:00Z'));
  });
});

describe('isPluralForms', () => {
  it('given plural forms, when checked, then they are one entry', () => {
    expect(isPluralForms(articles)).toBe(true);
    expect(isPluralForms(englishArticles)).toBe(true);
  });

  it('given an ordinary section or a string, when checked, then they are not plural forms', () => {
    expect(isPluralForms({ one: 'a', few: 'b' })).toBe(false);
    expect(isPluralForms({ other: 'a', title: 'b' })).toBe(false);
    expect(isPluralForms('{count}')).toBe(false);
    expect(isPluralForms(null)).toBe(false);
  });

  it.each(LANGUAGES)('given every %s plural entry, when checked, then it has exactly the forms the language needs', (language) => {
    const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
    const found: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (isPluralForms(value)) {
        found.push(path);
        expect(Object.keys(value).sort(), `${language}: ${path}`).toEqual([...categories].sort());
        return;
      }
      if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
      }
    };
    // The language's own files: its merged dictionary also holds the default's strings it falls back to.
    Object.entries(localeFiles)
      .filter(([path]) => path.startsWith(`./locales/${language}/`))
      .forEach(([, data]) => walk(data, ''));
    expect(found).toEqual(expect.arrayContaining(['search.found', 'tagPage.articlesCount', 'authorPage.articlesCount']));
  });
});

describe('useFormat', () => {
  const wrapper = (language: Language) => ({ children }: { children: ReactNode }) =>
    <LocalizationProvider language={language}>{children}</LocalizationProvider>;

  it('given the reader language, when formatting, then follows it, not a fixed locale', () => {
    const ru = renderHook(() => useFormat(), { wrapper: wrapper('ru') }).result.current;
    const en = renderHook(() => useFormat(), { wrapper: wrapper('en') }).result.current;

    expect(ru.date('2026-11-01T12:00:00Z')).toMatch(/^1 ноября 2026/);
    expect(en.date('2026-11-01T12:00:00Z')).toBe('November 1, 2026');
    expect(ru.plural(articles, 3)).toBe('3 статьи');
    expect(en.plural(englishArticles, 1)).toBe('1 article');
    expect(en.number(1000)).toBe('1,000');
  });
});
