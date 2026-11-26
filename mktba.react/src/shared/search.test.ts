import { describe, expect, it } from 'vitest';
import { isSearchableQuery, readSearchRequest, searchApiParams, searchHref, searchPageCount, searchResultHref } from './search';

describe('readSearchRequest', () => {
  it('given a query with stray whitespace and a page, when read, then the query is normalized and the page kept', () => {
    expect(readSearchRequest(new URLSearchParams('q=%20условия%20%20намаза%20&page=3'))).toEqual({ query: 'условия намаза', page: 3, verified: false });
  });

  it.each(['', 'page=0', 'page=-2', 'page=abc', 'page=1.5'])('given "%s", when read, then the page is 1', (search) => {
    expect(readSearchRequest(new URLSearchParams(search))).toEqual({ query: '', page: 1, verified: false });
  });

  it.each([['verified=1', true], ['verified=true', false], ['verified=0', false]] as const)(
    'given "%s", when read, then only verified=1 asks for verified articles (V-08, #124)',
    (search, verified) => {
      expect(readSearchRequest(new URLSearchParams(`q=пост&${search}`)).verified).toBe(verified);
    },
  );

  it('given a page past the last one the API serves, when read, then it is capped', () => {
    expect(readSearchRequest(new URLSearchParams('q=a&page=5000')).page).toBe(100);
  });
});

describe('isSearchableQuery', () => {
  it('given queries of 2 to 200 characters, when checked, then only they are searchable', () => {
    expect(isSearchableQuery('')).toBe(false);
    expect(isSearchableQuery('я')).toBe(false);
    expect(isSearchableQuery('ду')).toBe(true);
    expect(isSearchableQuery('а'.repeat(200))).toBe(true);
    expect(isSearchableQuery('а'.repeat(201))).toBe(false);
  });
});

describe('searchHref', () => {
  it('given a query, when built, then it is encoded and the first page has no page parameter', () => {
    expect(searchHref(' a&b=c ')).toBe('/search?q=a%26b%3Dc');
    expect(searchHref('намаз', 2)).toBe('/search?q=%D0%BD%D0%B0%D0%BC%D0%B0%D0%B7&page=2');
  });

  it('given the verified filter, when built, then the URL keeps it on every page and the API is asked for it', () => {
    expect(searchHref('пост', 1, true)).toBe('/search?q=%D0%BF%D0%BE%D1%81%D1%82&verified=1');
    expect(searchHref('пост', 3, true)).toBe('/search?q=%D0%BF%D0%BE%D1%81%D1%82&page=3&verified=1');
    expect(searchApiParams({ query: 'пост', page: 2, verified: true })).toEqual({ q: 'пост', page: '2', verified: 'true' });
    expect(searchApiParams({ query: 'пост', page: 1, verified: false })).toEqual({ q: 'пост', page: '1' });
  });
});

describe('searchResultHref', () => {
  it('given a result with a snippet paragraph, when built, then it points at that paragraph, otherwise at the article', () => {
    expect(searchResultHref({ slug: 'salat', paragraphId: 12 })).toBe('/salat#p-12');
    expect(searchResultHref({ slug: 'salat', paragraphId: null })).toBe('/salat');
  });
});

describe('searchPageCount', () => {
  it('given a total, when counted, then pages are rounded up and capped at the last page the API serves', () => {
    expect(searchPageCount(0, 10)).toBe(0);
    expect(searchPageCount(21, 10)).toBe(3);
    expect(searchPageCount(100000, 10)).toBe(100);
  });
});
