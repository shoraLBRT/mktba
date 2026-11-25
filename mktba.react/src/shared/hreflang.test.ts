import { describe, expect, it } from 'vitest';
import type { ArticleTranslationDto } from './types/ApiTypes';
import { articleAlternates } from './hreflang';

const translation = (overrides: Partial<ArticleTranslationDto> = {}): ArticleTranslationDto => ({
  articleId: 2, locale: 'en', slug: 'prayer', title: 'Prayer', status: 'Published', noIndex: false, ...overrides,
});

describe('articleAlternates (O-08, #104)', () => {
  const SITE = 'https://mktba.ru';
  const russian = { locale: 'ru', slug: 'namaz', noIndex: false };

  it('given no translation, when building, then there are none: a single version needs no hreflang', () => {
    expect(articleAlternates({ ...russian, translations: [] }, SITE)).toEqual([]);
  });

  it.each([
    ['a draft', { status: 'Draft' as const }],
    ['an archived one', { status: 'Archived' as const }],
    ['a noindex one', { noIndex: true }],
    ['one in a language the site does not serve', { locale: 'ar' }],
  ])('given only %s, when building, then it is left out and so are the links', (_name, overrides) => {
    expect(articleAlternates({ ...russian, translations: [translation(overrides)] }, SITE)).toEqual([]);
  });

  it('given an English original with a Russian translation, when building, then the links are in language order with x-default at Russian', () => {
    const alternates = articleAlternates(
      { locale: 'en', slug: 'prayer', noIndex: false, translations: [translation({ locale: 'ru', slug: 'namaz' })] },
      SITE,
    );

    expect(alternates.map((alternate) => alternate.hreflang)).toEqual(['ru', 'en', 'x-default']);
    expect(alternates[2].href).toBe('https://mktba.ru/namaz');
  });
});
