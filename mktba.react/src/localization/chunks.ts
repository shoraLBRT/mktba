/**
 * How the dictionaries are split for loading (I-02, #106). A locale file stays one file per namespace;
 * its top-level keys are split into chunks at build time by the `localeChunks` Vite plugin
 * (`vite.config.ts`), which serves `./locales/<lang>/<namespace>.json?locale-chunk=<chunk>`.
 *
 * - `core` — every key not listed below. It is in the first load of every page and in the server
 *   render, so the SSR'd public pages never wait for text.
 * - `admin` — the keys only the client-only admin (`/admin/*`, the editor included) reads. The admin
 *   route's `clientLoader` loads them (`loadLocaleChunk('admin')`) before the admin renders.
 *   Besides the keys listed below, every file under `locales/<lang>/admin/` is in it whole, under
 *   its file name as the key (`admin/siteAnalytics.json` -> `siteAnalytics`); that is the easy place
 *   for a new admin feature's strings (no list to edit, no shared file to conflict on).
 *
 * A new key is `core` unless it is listed here: listing it moves it out of the public first load.
 * Only list a key that nothing outside the admin reads.
 */
export const LAZY_LOCALE_CHUNKS = ['admin'] as const;

export type LazyLocaleChunk = (typeof LAZY_LOCALE_CHUNKS)[number];
export type LocaleChunk = 'core' | LazyLocaleChunk;

export const LAZY_LOCALE_KEYS: Record<LazyLocaleChunk, Partial<Record<string, readonly string[]>>> = {
  admin: {
    pages: [
      'adminPage',
      'adminLayout',
      'adminMyArticles',
      'adminTags',
      'adminReview',
      'adminArticleList',
      'profilePage',
      'activityChart',
    ],
    // `versionedParagraph` stays in `core`: the public article reads it.
    editor: ['addArticlePage', 'addArticleEditor', 'editArticlePage', 'articleDraftCopy', 'articleHistoryPage'],
  },
};

export const LOCALE_CHUNK_QUERY = 'locale-chunk';

const chunkOfKey = (namespace: string, key: string): LocaleChunk =>
  LAZY_LOCALE_CHUNKS.find((chunk) => LAZY_LOCALE_KEYS[chunk][namespace]?.includes(key)) ?? 'core';

/** The part of one namespace file that belongs to `chunk`. */
export const pickLocaleChunk = (
  namespace: string,
  data: Record<string, unknown>,
  chunk: LocaleChunk,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([key]) => chunkOfKey(namespace, key) === chunk));

export const isLocaleChunk = (value: string): value is LocaleChunk =>
  value === 'core' || (LAZY_LOCALE_CHUNKS as readonly string[]).includes(value);
