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
    & { searchAnalytics: typeof import('./locales/ru/admin/searchAnalytics.json') };
};

export type SupportedLocale = keyof typeof dictionaries;
export type Locale = (typeof dictionaries)['ru'];

export const locale: Locale = dictionaries.ru;

export const formatMessage = (template: string, params: Record<string, string | number>): string =>
  Object.entries(params).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
