import { describe, expect, it } from 'vitest';
import { articleLocaleQuery, languageFromPath, languageFromRequest, localizedPath } from './language';

describe('languageFromPath', () => {
  it.each([
    ['/', 'ru'],
    ['/salat', 'ru'],
    ['/search', 'ru'],
    ['/admin/articles', 'ru'],
    ['/en', 'en'],
    ['/en/', 'en'],
    ['/en/prayer', 'en'],
    ['/en/tags/fiqh', 'en'],
    ['/ru/salat', 'ru'],
    ['/english', 'ru'],
    ['/fr/x', 'ru'],
  ])('given %s, when read, then the language is %s', (path, language) => {
    expect(languageFromPath(path)).toBe(language);
  });

  it('given a request, when read, then the language is the one of its path', () => {
    expect(languageFromRequest(new Request('https://mktba.test/en/search?q=x'))).toBe('en');
    expect(languageFromRequest(new Request('https://mktba.test/salat'))).toBe('ru');
  });
});

describe('localizedPath', () => {
  it('given the default language, when localizing, then the path has no prefix', () => {
    expect(localizedPath('ru', '/search?q=x')).toBe('/search?q=x');
  });

  it('given English, when localizing, then the path gets /en and the home page is /en/', () => {
    expect(localizedPath('en', '/')).toBe('/en/');
    expect(localizedPath('en', '/tags/fiqh?page=2')).toBe('/en/tags/fiqh?page=2');
    expect(localizedPath('en', 'feedback')).toBe('/en/feedback');
  });

  it('given a path already in English, when localizing, then it is not prefixed twice', () => {
    expect(localizedPath('en', '/en/prayer')).toBe('/en/prayer');
  });
});

describe('articleLocaleQuery', () => {
  it('given the default language, when building, then there is no query, as before', () => {
    expect(articleLocaleQuery('ru')).toBe('');
  });

  it('given English, when building, then the API is asked for it', () => {
    expect(articleLocaleQuery('en')).toBe('?locale=en');
  });
});
