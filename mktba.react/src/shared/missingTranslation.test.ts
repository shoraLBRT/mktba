import { describe, expect, it, vi } from 'vitest';
import type { Language } from '../localization/language';
import { ApiError } from './api-client/apiError';
import { articleUrlTarget, fetchArticleForUrl, isShownOriginal, parseMissingTranslation } from './missingTranslation';
import type { ArticleContentDto, ArticleTranslationDto } from './types/ApiTypes';

const article = (slug: string, locale: string, translations: ArticleTranslationDto[] = []): ArticleContentDto =>
  ({ id: 7, title: 'Namaz', slug, locale, paragraphs: [], tags: [], translations }) as unknown as ArticleContentDto;

const translation = (slug: string, locale: string, status = 'Published'): ArticleTranslationDto =>
  ({ articleId: 8, locale, slug, title: 'Prayer', status, noIndex: false }) as unknown as ArticleTranslationDto;

const notFound = () => new ApiError('not found', 404);

describe('parseMissingTranslation', () => {
  it.each([
    [undefined, 'original'],
    ['', 'original'],
    ['original', 'original'],
    ['hide', 'hide'],
    [' HIDE ', 'hide'],
    ['nonsense', 'original'],
  ])('given %s, when parsed, then the mode is %s (I-08)', (value, mode) => {
    expect(parseMissingTranslation(value)).toBe(mode);
  });
});

describe('fetchArticleForUrl', () => {
  it('given an article of the URL language, when fetched, then asks that language only', async () => {
    const fetchBySlug = vi.fn(async () => article('prayer', 'en'));

    await expect(fetchArticleForUrl('prayer', 'en', fetchBySlug)).resolves.toMatchObject({ slug: 'prayer' });
    expect(fetchBySlug).toHaveBeenCalledTimes(1);
  });

  it('given a slug only another language has, when fetched, then returns that article (I-08)', async () => {
    const fetchBySlug = vi.fn(async (_slug: string, language: Language) => {
      if (language === 'en') throw notFound();
      return article('namaz', 'ru');
    });

    await expect(fetchArticleForUrl('namaz', 'en', fetchBySlug)).resolves.toMatchObject({ slug: 'namaz', locale: 'ru' });
    expect(fetchBySlug).toHaveBeenCalledWith('namaz', 'ru');
  });

  it('given a slug no language has, when fetched, then throws the 404 of the URL language', async () => {
    const first = notFound();
    const fetchBySlug = vi.fn(async (_slug: string, language: Language) => {
      throw language === 'en' ? first : new ApiError('gone', 410);
    });

    await expect(fetchArticleForUrl('x', 'en', fetchBySlug)).rejects.toBe(first);
  });

  it('given an article removed in the URL language, when fetched, then answers its 410 without asking others', async () => {
    const fetchBySlug = vi.fn(async () => {
      throw new ApiError('gone', 410);
    });

    await expect(fetchArticleForUrl('x', 'en', fetchBySlug)).rejects.toMatchObject({ status: 410 });
    expect(fetchBySlug).toHaveBeenCalledTimes(1);
  });

  it('given an API that fails on the second language, when fetched, then the failure is thrown', async () => {
    const fetchBySlug = vi.fn(async (_slug: string, language: Language) => {
      throw language === 'en' ? notFound() : new ApiError('down', 503);
    });

    await expect(fetchArticleForUrl('x', 'en', fetchBySlug)).rejects.toMatchObject({ status: 503 });
  });
});

describe('articleUrlTarget', () => {
  const at = (pathname: string, language: Language, mode: 'original' | 'hide' = 'original', legacyLink = false) =>
    ({ pathname, language, mode, legacyLink });

  it('given the article at its own URL, when checked, then it stays', () => {
    expect(articleUrlTarget(article('namaz', 'ru'), at('/namaz', 'ru'))).toBeNull();
    expect(articleUrlTarget(article('prayer', 'en'), at('/en/prayer', 'en'))).toBeNull();
  });

  it('given an old slug or an id link, when checked, then goes permanently to the own URL', () => {
    expect(articleUrlTarget(article('namaz', 'ru'), at('/salat', 'ru'))).toEqual({ path: '/namaz', permanent: true });
    expect(articleUrlTarget(article('prayer', 'en'), at('/7', 'ru', 'original', true))).toEqual({ path: '/en/prayer', permanent: true });
  });

  it('given an article of another language with a published translation, when checked, then goes to it temporarily (I-08)', () => {
    const content = article('namaz', 'ru', [translation('prayer', 'en')]);

    expect(articleUrlTarget(content, at('/en/namaz', 'en'))).toEqual({ path: '/en/prayer', permanent: false });
    expect(articleUrlTarget(content, at('/en/namaz', 'en', 'hide'))).toEqual({ path: '/en/prayer', permanent: false });
  });

  it('given an article of another language with a draft translation only, when checked, then shows the original (I-08)', () => {
    const content = article('namaz', 'ru', [translation('prayer', 'en', 'Draft')]);

    expect(articleUrlTarget(content, at('/en/namaz', 'en'))).toBeNull();
    expect(isShownOriginal(content, 'en', false)).toBe(true);
  });

  it('given an article of another language without a translation, when hidden, then goes to the language home (I-08)', () => {
    expect(articleUrlTarget(article('namaz', 'ru'), at('/en/namaz', 'en', 'hide'))).toEqual({ path: '/en/', permanent: false });
    expect(articleUrlTarget(article('prayer', 'en'), at('/prayer', 'ru', 'hide'))).toEqual({ path: '/', permanent: false });
  });

  it('given an original of another language under an old slug, when shown, then goes permanently to its current slug in the URL language', () => {
    expect(articleUrlTarget(article('namaz', 'ru'), at('/en/salat', 'en'))).toEqual({ path: '/en/namaz', permanent: true });
  });

  it('given an id link, when checked, then it is never a shown original', () => {
    expect(isShownOriginal(article('prayer', 'en'), 'ru', true)).toBe(false);
  });
});
