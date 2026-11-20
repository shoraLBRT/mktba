import { describe, expect, it } from 'vitest';
import { isSearchableQuery, readSearchRequest, searchHref, searchPageCount, searchResultHref } from './search';

describe('readSearchRequest', () => {
  it('given a query with stray whitespace and a page, when read, then the query is normalized and the page kept', () => {
    expect(readSearchRequest(new URLSearchParams('q=%20условия%20%20намаза%20&page=3'))).toEqual({ query: 'условия намаза', page: 3 });
  });

  it.each(['', 'page=0', 'page=-2', 'page=abc', 'page=1.5'])('given "%s", when read, then the page is 1', (search) => {
    expect(readSearchRequest(new URLSearchParams(search))).toEqual({ query: '', page: 1 });
  });

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
