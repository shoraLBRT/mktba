import { describe, expect, it } from 'vitest';
import { missingTranslationLocales, newTranslationPath } from './translations';

describe('missingTranslationLocales', () => {
  it('lists the languages with no version yet, never the article own', () => {
    expect(missingTranslationLocales('ru', [])).toEqual(['en']);
    expect(missingTranslationLocales('en', [])).toEqual(['ru']);
    expect(missingTranslationLocales('ru', [{ articleId: 2, locale: 'en', slug: 'prayer', title: 'Prayer', status: 'Draft', noIndex: false }])).toEqual([]);
  });
});

describe('newTranslationPath', () => {
  it('opens the new-article editor with the source and the language', () => {
    expect(newTranslationPath(7, 'en')).toBe('/admin/articles/new?translationOf=7&locale=en');
  });
});
