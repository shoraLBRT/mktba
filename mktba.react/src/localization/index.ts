import { DEFAULT_LANGUAGE, languageFromPath, type Language } from './language';
import { dictionaries as loadedDictionaries, dictionaryLanguage, localeFileLanguages } from './loader';

export { isLanguageLoaded, loadLanguage, loadLocaleChunk } from './loader';
export type { LazyLocaleChunk } from './chunks';

/**
 * Typed as every key of every file, but a language is there only once it is loaded (`loadLanguage`;
 * Russian also comes with the Russian pages' route modules, `./defaultLanguage.ts`), and the keys of
 * a lazy chunk (./chunks.ts, the admin's) only once `loadLocaleChunk` has resolved; the admin route
 * awaits it before rendering. Read a dictionary through `dictionaryFor`, which checks.
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
    & { articleTrash: typeof import('./locales/ru/admin/articleTrash.json') }
    & { auditLog: typeof import('./locales/ru/admin/auditLog.json') }
    & { scholarApplication: typeof import('./locales/ru/admin/scholarApplication.json') }
    & { scholarReview: typeof import('./locales/ru/admin/scholarReview.json') }
    & { articleTranslation: typeof import('./locales/ru/admin/articleTranslation.json') };
};

export type SupportedLocale = keyof typeof dictionaries;
export type Locale = (typeof dictionaries)['ru'];

/**
 * The dictionary of a language (for a language without files: the default one's). Its keys are the
 * language's own; only the admin's fall back to Russian (`loader.ts`). It must be loaded first
 * (`loadLanguage`): the entries load the page's language, the provider waits for any other.
 */
export const dictionaryFor = (language: Language): Locale => {
  const dictionary = (dictionaries as Record<string, unknown>)[dictionaryLanguage(language)];
  if (!dictionary) {
    throw new Error(`The "${language}" dictionary is not loaded: await loadLanguage("${language}") first.`);
  }

  return dictionary as Locale;
};

/**
 * The dictionary of the reader's language, for code outside React (the API error messages): the
 * language of the browser's URL, the one the page renders in. On the server, where one process
 * renders every language, it is the default one; a component reads `useLocale()` instead.
 */
export const readerLocale = (): Locale =>
  dictionaryFor(typeof window === 'undefined' ? DEFAULT_LANGUAGE : languageFromPath(window.location.pathname));

/** Whether the language has dictionary files of its own, not only the default one's strings. */
export const hasOwnDictionary = (language: Language): boolean => localeFileLanguages.has(language);

export {
  formatDate,
  formatMessage,
  formatNumber,
  formatPlural,
  isPluralForms,
  type DateStyle,
  type PluralForms,
} from './format';
