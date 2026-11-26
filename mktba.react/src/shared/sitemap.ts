/**
 * `sitemap.xml` and `robots.txt` (O-06, #57): pure builders the resource routes serve. Every URL
 * is made with {@link articleHref} and {@link siteUrlFor}, so the sitemap follows the reader's URLs.
 */
import { DEFAULT_LANGUAGE, localizedPath } from '../localization/language';
import { siteUrlFor } from './siteMeta';
import { articleHref } from './slug';
import type { SitemapArticleDto } from './types/ApiTypes';

/** Most URLs one sitemap file may hold (sitemaps.org); a longer list is split behind an index. */
export const SITEMAP_MAX_URLS = 50_000;

/** Language of the URLs without a prefix (D6, #21): `/` is Russian, `/en/` is English. */
export const DEFAULT_LOCALE: string = DEFAULT_LANGUAGE;

/**
 * The locales whose articles are served to search engines (O-08, #104): the sitemap lists their
 * articles, an article page in one of them is indexed, and the language versions of an article link
 * each other with hreflang. An article in any other language is `noindex`.
 */
export const SERVED_LOCALES: readonly string[] = [DEFAULT_LOCALE, 'en'];

/**
 * The locales whose other pages (home, search, authors, tags) are indexed. `/en/…` lists still show
 * the Russian articles until per-language lists (#110; the missing-translation rule of #112 is
 * for article pages only), so an English list page stays `noindex` and has no hreflang; `en` is
 * added here with them.
 */
export const INDEXED_LIST_LOCALES: readonly string[] = [DEFAULT_LOCALE];

/**
 * Query parameters that never change a page's content: Yandex folds them with `Clean-param`.
 * `mazhab` only picks which opinion is shown first; the HTML carries every opinion (O-03) and the
 * canonical URL drops it.
 */
export const CLEAN_PARAMS: readonly string[] = [
  'mazhab', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'yclid', 'ysclid', 'gclid', 'fbclid',
];

/** Path of the n-th (1-based) file of a split sitemap. */
export const sitemapChunkPath = (page: number): string => `/sitemaps/articles-${page}.xml`;

/** The page number in a {@link sitemapChunkPath} file name (`articles-3.xml` → 3), or null. */
export const parseSitemapChunkName = (name: string): number | null => {
  const match = /^articles-([1-9][0-9]*)\.xml$/.exec(name);
  return match ? Number(match[1]) : null;
};

/**
 * A language version of a page: `<xhtml:link rel="alternate" hreflang href>` in the sitemap,
 * `<link rel="alternate" hreflang href>` in the page's head.
 */
export type SitemapAlternate = { hreflang: string; href: string };

/** One language version of a text, by its absolute URL. */
export type LanguageVersion = { locale: string; url: string };

/**
 * The hreflang links of a text's language versions (O-08, #104), the same list on every version:
 * one per version, the page itself included, then `x-default` at the default-locale version when
 * there is one (a reader whose language has no version gets the Russian original). A text with a
 * single version has none.
 */
export const hreflangAlternates = (versions: readonly LanguageVersion[]): SitemapAlternate[] => {
  if (versions.length < 2) return [];

  const alternates = versions.map((version) => ({ hreflang: version.locale, href: version.url }));
  const fallback = versions.find((version) => version.locale === DEFAULT_LOCALE);
  return fallback ? [...alternates, { hreflang: 'x-default', href: fallback.url }] : alternates;
};

/** One `<url>` of a sitemap. */
export type SitemapEntry = { loc: string; lastmod: string | null; alternates: SitemapAlternate[] };

/** The site-relative path of an article in its locale: no prefix for the default one. */
export { localizedPath };

/**
 * A W3C datetime (`2026-11-01T10:30:00Z`) for `lastmod`, or null for an unreadable value. A time
 * without an offset is the API's UTC.
 */
export const w3cDateTime = (value: string): string | null => {
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

/**
 * The sitemap's URLs: the home page, then every article in a served locale. An article with a
 * listed translation carries the {@link hreflangAlternates} of its group.
 */
export const sitemapEntries = (
  articles: readonly SitemapArticleDto[],
  siteUrl: string,
  servedLocales: readonly string[] = SERVED_LOCALES,
): SitemapEntry[] => {
  const served = articles.filter((article) => servedLocales.includes(article.locale));
  const urlOf = (article: SitemapArticleDto) => siteUrlFor(localizedPath(article.locale, articleHref(article.slug)), siteUrl);

  const groups = new Map<string, SitemapArticleDto[]>();
  for (const article of served) {
    groups.set(article.translationGroupId, [...(groups.get(article.translationGroupId) ?? []), article]);
  }

  const alternatesOf = (article: SitemapArticleDto): SitemapAlternate[] =>
    hreflangAlternates((groups.get(article.translationGroupId) ?? []).map((version) => ({ locale: version.locale, url: urlOf(version) })));

  return [
    { loc: siteUrlFor('/', siteUrl), lastmod: null, alternates: [] },
    ...served.map((article) => ({
      loc: urlOf(article),
      lastmod: w3cDateTime(article.lastModified),
      alternates: alternatesOf(article),
    })),
  ];
};

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Text safe inside an XML element or a double-quoted attribute. */
export const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** A `<urlset>` sitemap file. */
export const urlsetXml = (entries: readonly SitemapEntry[]): string => {
  const urls = entries.map((entry) => {
    const lines = [`<loc>${escapeXml(entry.loc)}</loc>`];
    if (entry.lastmod) lines.push(`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    for (const alternate of entry.alternates) {
      lines.push(`<xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}"/>`);
    }
    return `<url>${lines.join('')}</url>`;
  });

  return [
    XML_DECLARATION,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
};

/** One `<sitemap>` of a sitemap index. */
export type SitemapIndexEntry = { loc: string; lastmod: string | null };

/** A `<sitemapindex>` file. */
export const sitemapIndexXml = (sitemaps: readonly SitemapIndexEntry[]): string => [
  XML_DECLARATION,
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemaps.map((sitemap) =>
    `<sitemap><loc>${escapeXml(sitemap.loc)}</loc>${sitemap.lastmod ? `<lastmod>${escapeXml(sitemap.lastmod)}</lastmod>` : ''}</sitemap>`),
  '</sitemapindex>',
  '',
].join('\n');

/** The entries split into files of at most `size` URLs, in order. */
export const chunkEntries = (entries: readonly SitemapEntry[], size: number = SITEMAP_MAX_URLS): SitemapEntry[][] => {
  const chunks: SitemapEntry[][] = [];
  for (let start = 0; start < entries.length; start += size) {
    chunks.push(entries.slice(start, start + size));
  }
  return chunks;
};

/** The latest `lastmod` of the entries (W3C datetimes in UTC compare as text), or null. */
const latestLastmod = (entries: readonly SitemapEntry[]): string | null =>
  entries.reduce<string | null>((latest, entry) => (entry.lastmod && (!latest || entry.lastmod > latest) ? entry.lastmod : latest), null);

/**
 * What `/sitemap.xml` serves: the URLs themselves while they fit in one file, otherwise an index
 * of the {@link sitemapChunkPath} files, each dated by its newest URL.
 */
export const sitemapXml = (entries: readonly SitemapEntry[], siteUrl: string, size: number = SITEMAP_MAX_URLS): string => {
  if (entries.length <= size) return urlsetXml(entries);

  return sitemapIndexXml(chunkEntries(entries, size).map((chunk, index) => ({
    loc: siteUrlFor(sitemapChunkPath(index + 1), siteUrl),
    lastmod: latestLastmod(chunk),
  })));
};

/** The n-th (1-based) file of a split sitemap, or null when there is no such file. */
export const sitemapChunkXml = (entries: readonly SitemapEntry[], page: number, size: number = SITEMAP_MAX_URLS): string | null => {
  if (entries.length <= size) return null;

  const chunk = chunkEntries(entries, size)[page - 1];
  return chunk ? urlsetXml(chunk) : null;
};

/** `robots.txt`: everything but the admin panel, tracking parameters folded, the sitemap named. */
export const robotsTxt = (siteUrl: string): string => [
  'User-agent: *',
  'Disallow: /admin',
  `Clean-param: ${CLEAN_PARAMS.join('&')} /`,
  '',
  `Sitemap: ${siteUrlFor('/sitemap.xml', siteUrl)}`,
  '',
].join('\n');
