import { describe, expect, it } from 'vitest';
import { DEFAULT_ARTICLE_LIST_PARAMS, parseArticleListParams, toArticleListQuery } from './articleListParams';

describe('articleListParams', () => {
  it('given an empty query, when parsed, then returns the defaults', () => {
    expect(parseArticleListParams(new URLSearchParams())).toEqual(DEFAULT_ARTICLE_LIST_PARAMS);
  });

  it('given filters, sort and page, when written to the URL and read back, then they survive the round trip', () => {
    const params = {
      ...DEFAULT_ARTICLE_LIST_PARAMS,
      search: 'намаз',
      status: 'InReview' as const,
      authorId: 7,
      tag: 'фикх',
      locale: 'ru',
      sort: 'Title' as const,
      dir: 'Asc' as const,
      page: 3,
      pageSize: 50,
    };

    expect(parseArticleListParams(toArticleListQuery(params))).toEqual(params);
  });

  it('given the defaults, when written to the URL, then the query stays empty', () => {
    expect(toArticleListQuery(DEFAULT_ARTICLE_LIST_PARAMS).toString()).toBe('');
  });

  it('given malformed values, when parsed, then each falls back to its default', () => {
    const parsed = parseArticleListParams(
      new URLSearchParams('status=Deleted&authorId=-1&sort=popularity&dir=up&page=0&pageSize=7'),
    );

    expect(parsed).toEqual(DEFAULT_ARTICLE_LIST_PARAMS);
  });
});
