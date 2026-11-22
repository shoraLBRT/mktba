import { DEFAULT_LANGUAGE, type Language } from './language';
import { dictionaries as loadedDictionaries } from './loader';

export { loadLocaleChunk } from './loader';
export type { LazyLocaleChunk } from './chunks';

/**
 * Typed as every key of every file, but the keys of a lazy chunk (./chunks.ts, the admin's) are
 * there only once `loadLocaleChunk` has resolved; the admin route awaits it before rendering.
 */
export const dictionaries = loadedDictionaries as typeof loadedDictionaries & {
  ru: typeof import('./locales/ru/brand.json')
    & typeof import('./locales/ru/shared.json')
    & typeof import('./locales/ru/pages.json')
    & typeof import('./locales/ru/editor.json')
    // Section files of the admin chunk: the file name is the key.
    & { siteAnalytics: typeof import('./locales/ru/admin/siteAnalytics.json') }
    & { authorDashboard: typeof import('./locales/ru/admin/authorDashboard.json') }
    & { searchAnalytics: typeof import('./locales/ru/admin/searchAnalytics.json') }
    & { contentAnalytics: typeof import('./locales/ru/admin/contentAnalytics.json') }
    & { articleAnalytics: typeof import('./locales/ru/admin/articleAnalytics.json') }
    & { analyticsTools: typeof import('./locales/ru/admin/analyticsTools.json') }
    & { articleTrash: typeof import('./locales/ru/admin/articleTrash.json') };
};

export type SupportedLocale = keyof typeof dictionaries;
export type Locale = (typeof dictionaries)['ru'];

export const locale: Locale = dictionaries.ru;

/**
 * The dictionary of a language. A language without its own files yet (`en` until #109) reads the
 * default one; one with files falls back to it key by key (`loader.ts`).
 */
export const dictionaryFor = (language: Language): Locale =>
  ((dictionaries as Record<string, unknown>)[language] ?? dictionaries[DEFAULT_LANGUAGE]) as Locale;

/** Whether the language has a dictionary of its own, not only the default one's strings. */
export const hasOwnDictionary = (language: Language): boolean => language in dictionaries;

export {
  formatDate,
  formatMessage,
  formatNumber,
  formatPlural,
  isPluralForms,
  type DateStyle,
  type PluralForms,
} from './format';
