import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import type { ArticleContentDto } from '../shared/types/ApiTypes';
import { loader } from './article';

const article = (slug: string): ArticleContentDto => ({ id: 7, title: 'Салат', slug, paragraphs: [], tags: [] });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers the article content call with `content`, and every other API call with an empty list. */
const mockApi = (content: Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
    String(input).includes('/content') ? content : json([]));

/** Runs the loader for `/{slug}`, or for the old `/article/{slug}` when `legacy` is set; `search` is the query. */
const load = (slug: string, { legacy = false, search = '', english = false } = {}) => {
  const url = `http://mktba.test${legacy ? '/article' : ''}${english ? '/en' : ''}/${slug}${search}`;
  return loader({
    params: { slug },
    request: new Request(url),
    context: {},
    unstable_pattern: legacy ? '/article/:slug' : english ? '/en/:slug' : '/:slug',
    unstable_url: new URL(url),
  } as unknown as Parameters<typeof loader>[0]);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('article route loader', () => {
  it('given a published article, when its URL is loaded on the server, then hands the article to React Query', async () => {
    mockApi(json(article('salat')));

    const result = await load('salat');

    expect(result.init?.status).toBeUndefined();
    expect(result.data.missing).toBeNull();
    const contentQuery = result.data.dehydratedState?.queries.find(
      (query) => query.queryKey[0] === APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT,
    );
    expect(contentQuery?.queryKey).toEqual([APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', 'ru', 'salat']);
    expect(contentQuery?.state.data).toEqual(article('salat'));
  });

  it('given /en/{slug}, when it is loaded, then asks the API for the English article and keeps the URL (I-01)', async () => {
    const fetchMock = mockApi(json({ ...article('prayer'), locale: 'en' }));

    const result = await load('prayer', { english: true });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/articles/by-slug/prayer/content?locale=en');
    expect(result.data.missing).toBeNull();
    const contentQuery = result.data.dehydratedState?.queries.find(
      (query) => query.queryKey[0] === APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT,
    );
    expect(contentQuery?.queryKey).toEqual([APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', 'en', 'prayer']);
  });

  it('given an old id link to an English article, when it is loaded, then redirects permanently to /en/{slug} (I-01)', async () => {
    mockApi(json({ ...article('prayer'), locale: 'en' }));

    const redirect = (await load('7', { legacy: true }).catch((thrown: unknown) => thrown)) as Response;

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('/en/prayer');
  });

  it('given an old slug, when it is loaded, then redirects permanently to the current slug URL', async () => {
    mockApi(json(article('namaz')));

    const redirect = await load('salat').catch((thrown: unknown) => thrown);

    expect(redirect).toBeInstanceOf(Response);
    expect((redirect as Response).status).toBe(301);
    expect((redirect as Response).headers.get('Location')).toBe('/namaz');
  });

  it('given an old numeric id link, when it is loaded, then asks for the article by id and redirects to its slug', async () => {
    const fetchMock = mockApi(json(article('salat')));

    const redirect = (await load('7').catch((thrown: unknown) => thrown)) as Response;

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/articles\/7\/content$/);
    expect(redirect.headers.get('Location')).toBe('/salat');
  });

  it('given an old /article/{slug} URL of the current slug, when it is loaded, then redirects permanently to /{slug} keeping the query', async () => {
    mockApi(json(article('salat')));

    const redirect = (await load('salat', { legacy: true, search: '?mazhab=hanafi' }).catch((thrown: unknown) => thrown)) as Response;

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('/salat?mazhab=hanafi');
  });

  it('given an old /article/{id} URL, when it is loaded, then redirects permanently to the article at /{slug}', async () => {
    mockApi(json(article('salat')));

    const redirect = (await load('7', { legacy: true }).catch((thrown: unknown) => thrown)) as Response;

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('/salat');
  });

  it('given an article the API does not have, when it is loaded, then answers 404 without data', async () => {
    mockApi(json({ title: 'Article not found' }, 404));

    const result = await load('no-such-article');

    expect(result.init?.status).toBe(404);
    expect(result.data).toEqual({ missing: 404 });
  });

  it('given an article that was removed, when it is loaded, then answers 410 without data', async () => {
    mockApi(json({ code: 'article_gone' }, 410));

    const result = await load('udalennaya');

    expect(result.init?.status).toBe(410);
    expect(result.data).toEqual({ missing: 410 });
  });

  describe('given /en/{slug} of a Russian article (I-08)', () => {
    /** The English lookup answers 404, the Russian one `russian`. */
    const mockLanguages = (russian: ArticleContentDto) =>
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (!url.includes('/content')) return json([]);
        return url.includes('locale=en') ? json({ code: 'article_not_found' }, 404) : json(russian);
      });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('with a published English translation, when loaded, then redirects temporarily to it', async () => {
      mockLanguages({ ...article('namaz'), locale: 'ru', translations: [
        { articleId: 8, locale: 'en', slug: 'prayer', title: 'Prayer', status: 'Published', noIndex: false },
      ] } as ArticleContentDto);

      const redirect = (await load('namaz', { english: true, search: '?mazhab=hanafi' }).catch((thrown: unknown) => thrown)) as Response;

      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('Location')).toBe('/en/prayer?mazhab=hanafi');
    });

    it('without a translation, when loaded with the default setting, then shows the Russian original at the English URL', async () => {
      mockLanguages({ ...article('namaz'), locale: 'ru' });

      const result = await load('namaz', { english: true });

      expect(result.init?.status).toBeUndefined();
      const contentQuery = result.data.dehydratedState?.queries.find(
        (query) => query.queryKey[0] === APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT,
      );
      expect(contentQuery?.queryKey).toEqual([APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', 'en', 'namaz']);
      expect(contentQuery?.state.data).toMatchObject({ slug: 'namaz', locale: 'ru' });
    });

    it('without a translation, when loaded with MISSING_TRANSLATION=hide, then redirects temporarily to the English home', async () => {
      vi.stubEnv('MISSING_TRANSLATION', 'hide');
      mockLanguages({ ...article('namaz'), locale: 'ru' });

      const redirect = (await load('namaz', { english: true }).catch((thrown: unknown) => thrown)) as Response;

      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('Location')).toBe('/en/');
    });
  });

  it('given an API that fails, when an article is loaded, then the error boundary answers 503 with Retry-After', async () => {
    mockApi(json({}, 500));

    const thrown = await load('salat').catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(503);
    expect((thrown as Response).headers.get('Retry-After')).toBe('120');
  });

  it('given an API that cannot be reached, when an article is loaded, then the error boundary answers 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(load('salat')).rejects.toMatchObject({ status: 503 });
  });
});
