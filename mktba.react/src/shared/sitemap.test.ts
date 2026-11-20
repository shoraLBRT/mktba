import { describe, expect, it } from 'vitest';
import {
  CLEAN_PARAMS,
  chunkEntries,
  escapeXml,
  parseSitemapChunkName,
  robotsTxt,
  sitemapChunkXml,
  sitemapEntries,
  sitemapXml,
  urlsetXml,
  w3cDateTime,
  type SitemapEntry,
} from './sitemap';
import type { SitemapArticleDto } from './types/ApiTypes';

const SITE = 'https://mktba.ru';

const article = (slug: string, overrides: Partial<SitemapArticleDto> = {}): SitemapArticleDto => ({
  slug,
  locale: 'ru',
  translationGroupId: `group-${slug}`,
  lastModified: '2026-11-01T10:30:00.123Z',
  ...overrides,
});

const entry = (loc: string, lastmod: string | null = null): SitemapEntry => ({ loc, lastmod, alternates: [] });

describe('sitemap entries', () => {
  it('given published articles, when building entries, then the home page comes first and each article gets its reader URL and lastmod', () => {
    const entries = sitemapEntries([article('namaz')], SITE);

    expect(entries).toEqual([
      { loc: 'https://mktba.ru/', lastmod: null, alternates: [] },
      { loc: 'https://mktba.ru/namaz', lastmod: '2026-11-01T10:30:00Z', alternates: [] },
    ]);
  });

  it('given an article without a translation, when building entries, then it has no alternates', () => {
    const entries = sitemapEntries([article('a'), article('b')], SITE);

    expect(entries.every((item) => item.alternates.length === 0)).toBe(true);
  });

  it('given a translation in a served locale, when building entries, then both versions list each other and x-default points at Russian', () => {
    const group = 'g-1';
    const entries = sitemapEntries(
      [article('namaz', { translationGroupId: group }), article('prayer', { locale: 'en', translationGroupId: group })],
      SITE,
      ['ru', 'en'],
    );

    const expected = [
      { hreflang: 'ru', href: 'https://mktba.ru/namaz' },
      { hreflang: 'en', href: 'https://mktba.ru/en/prayer' },
      { hreflang: 'x-default', href: 'https://mktba.ru/namaz' },
    ];
    expect(entries.map((item) => item.loc)).toEqual([
      'https://mktba.ru/',
      'https://mktba.ru/namaz',
      'https://mktba.ru/en/prayer',
    ]);
    expect(entries[1].alternates).toEqual(expected);
    expect(entries[2].alternates).toEqual(expected);
  });

  it('given an English article while only Russian pages are served, when building entries, then it and its alternate are left out', () => {
    const group = 'g-1';
    const entries = sitemapEntries(
      [article('namaz', { translationGroupId: group }), article('prayer', { locale: 'en', translationGroupId: group })],
      SITE,
    );

    expect(entries.map((item) => item.loc)).toEqual(['https://mktba.ru/', 'https://mktba.ru/namaz']);
    expect(entries[1].alternates).toEqual([]);
  });

  it('given a slug with characters reserved in URLs, when building entries, then it is percent-encoded like the reader link', () => {
    const entries = sitemapEntries([article('a b')], SITE);

    expect(entries[1].loc).toBe('https://mktba.ru/a%20b');
  });
});

describe('lastmod format', () => {
  it('given an ISO time in UTC, when formatting, then it is a W3C datetime without milliseconds', () => {
    expect(w3cDateTime('2026-11-01T10:30:00.5Z')).toBe('2026-11-01T10:30:00Z');
  });

  it('given a time with an offset, when formatting, then it is converted to UTC', () => {
    expect(w3cDateTime('2026-11-01T13:30:00+03:00')).toBe('2026-11-01T10:30:00Z');
  });

  it('given a time without an offset, when formatting, then it is read as UTC', () => {
    expect(w3cDateTime('2026-11-01T10:30:00')).toBe('2026-11-01T10:30:00Z');
  });

  it('given an unreadable value, when formatting, then there is no lastmod', () => {
    expect(w3cDateTime('not a date')).toBeNull();
  });
});

describe('sitemap XML', () => {
  it('given text with XML metacharacters, when escaping, then each is replaced by its entity', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('given entries, when writing a urlset, then each URL carries loc, lastmod and escaped alternates', () => {
    const xml = urlsetXml([
      { loc: 'https://mktba.ru/?a=1&b=2', lastmod: '2026-11-01T10:30:00Z', alternates: [{ hreflang: 'ru', href: 'https://mktba.ru/x?a&b' }] },
      entry('https://mktba.ru/'),
    ]);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')).toBe(true);
    expect(xml).toContain('<url><loc>https://mktba.ru/?a=1&amp;b=2</loc><lastmod>2026-11-01T10:30:00Z</lastmod>'
      + '<xhtml:link rel="alternate" hreflang="ru" href="https://mktba.ru/x?a&amp;b"/></url>');
    expect(xml).toContain('<url><loc>https://mktba.ru/</loc></url>');
  });

  it('given entries within the limit, when writing sitemap.xml, then it is one urlset', () => {
    const xml = sitemapXml([entry('https://mktba.ru/a'), entry('https://mktba.ru/b')], SITE, 2);

    expect(xml).toContain('<urlset');
    expect(xml).not.toContain('<sitemapindex');
  });

  it('given more entries than fit in one file, when writing sitemap.xml, then it is an index of the chunk files dated by their newest URL', () => {
    const entries = [
      entry('https://mktba.ru/a', '2026-01-01T00:00:00Z'),
      entry('https://mktba.ru/b', '2026-03-01T00:00:00Z'),
      entry('https://mktba.ru/c'),
    ];

    const xml = sitemapXml(entries, SITE, 2);

    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<sitemap><loc>https://mktba.ru/sitemaps/articles-1.xml</loc><lastmod>2026-03-01T00:00:00Z</lastmod></sitemap>');
    expect(xml).toContain('<sitemap><loc>https://mktba.ru/sitemaps/articles-2.xml</loc></sitemap>');
  });

  it('given a split sitemap, when asking for each chunk, then chunks hold their URLs in order and past the last there is none', () => {
    const entries = ['a', 'b', 'c'].map((name) => entry(`https://mktba.ru/${name}`));

    expect(chunkEntries(entries, 2).map((chunk) => chunk.length)).toEqual([2, 1]);
    expect(sitemapChunkXml(entries, 2, 2)).toContain('<loc>https://mktba.ru/c</loc>');
    expect(sitemapChunkXml(entries, 3, 2)).toBeNull();
  });

  it('given a sitemap that fits in one file, when asking for a chunk, then there is none', () => {
    expect(sitemapChunkXml([entry('https://mktba.ru/a')], 1, 2)).toBeNull();
  });

  it.each([
    ['articles-1.xml', 1],
    ['articles-12.xml', 12],
    ['articles-0.xml', null],
    ['articles-01.xml', null],
    ['articles-1.xml.gz', null],
    ['other.xml', null],
  ])('given the chunk file name %s, when parsing, then the page is %s', (name, page) => {
    expect(parseSitemapChunkName(name)).toBe(page);
  });
});

describe('robots.txt', () => {
  it('given the site URL, when writing robots.txt, then it bars the admin panel, folds tracking params and names the absolute sitemap', () => {
    const robots = robotsTxt(SITE);

    expect(robots.split('\n')).toEqual([
      'User-agent: *',
      'Disallow: /admin',
      `Clean-param: ${CLEAN_PARAMS.join('&')} /`,
      '',
      'Sitemap: https://mktba.ru/sitemap.xml',
      '',
    ]);
    expect(CLEAN_PARAMS).toEqual(expect.arrayContaining(['mazhab', 'utm_source']));
  });
});
