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

const load = (slug: string) =>
  loader({
    params: { slug },
    request: new Request(`http://mktba.test/article/${slug}`),
    context: {},
    unstable_pattern: '/article/:slug',
    unstable_url: new URL(`http://mktba.test/article/${slug}`),
  } as unknown as Parameters<typeof loader>[0]);

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
    expect(contentQuery?.queryKey).toEqual([APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', 'salat']);
    expect(contentQuery?.state.data).toEqual(article('salat'));
  });

  it('given an old slug, when it is loaded, then redirects permanently to the current slug URL', async () => {
    mockApi(json(article('namaz')));

    const redirect = await load('salat').catch((thrown: unknown) => thrown);

    expect(redirect).toBeInstanceOf(Response);
    expect((redirect as Response).status).toBe(301);
    expect((redirect as Response).headers.get('Location')).toBe('/article/namaz');
  });

  it('given an old numeric id link, when it is loaded, then asks for the article by id and redirects to its slug', async () => {
    const fetchMock = mockApi(json(article('salat')));

    const redirect = (await load('7').catch((thrown: unknown) => thrown)) as Response;

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/articles\/7\/content$/);
    expect(redirect.headers.get('Location')).toBe('/article/salat');
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
