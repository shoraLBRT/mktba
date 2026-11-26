/**
 * The reader's language comes from the URL (I-01, #105; D6, #21): `/…` is Russian, `/en/…` is
 * English. One rule for the server render, the browser and the loaders, so the HTML and the
 * hydrated page always agree on the language.
 */

/** The languages the site has URLs for; the first is the default one, without a prefix. */
export const LANGUAGES = ['ru', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Language of the URLs without a prefix. */
export const DEFAULT_LANGUAGE: Language = 'ru';

/** The languages with a URL prefix: every one but the default. */
export const PREFIXED_LANGUAGES = LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE);

export const isLanguage = (value: string | null | undefined): value is Language =>
  (LANGUAGES as readonly string[]).includes(value ?? '');

/** The language of a site path: its first segment when that is a prefixed language, else the default. */
export const languageFromPath = (pathname: string): Language => {
  const firstSegment = pathname.split('/')[1] ?? '';
  return isLanguage(firstSegment) && firstSegment !== DEFAULT_LANGUAGE ? firstSegment : DEFAULT_LANGUAGE;
};

/** The language of a loader's request URL. */
export const languageFromRequest = (request: Request): Language => languageFromPath(new URL(request.url).pathname);

/**
 * The site path in a language: `/search` stays `/search` in Russian and becomes `/en/search` in
 * English; the home page `/` becomes `/en/`. Takes any locale code (an article's `locale` from the
 * API); a path already in a language is not prefixed twice.
 */
export const localizedPath = (language: string, path: string): string => {
  if (language === DEFAULT_LANGUAGE || languageFromPath(path) !== DEFAULT_LANGUAGE) {
    return path;
  }

  return `/${language}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * The same site path without its language prefix: `/en/search` -> `/search`, `/en/` and `/en` -> `/`;
 * a Russian path is returned as it is. With {@link localizedPath}, the same page in another language.
 */
export const pathWithoutLanguage = (pathname: string): string => {
  const language = languageFromPath(pathname);
  if (language === DEFAULT_LANGUAGE) return pathname;
  return pathname.slice(language.length + 1) || '/';
};

/** A language's name in the interface language, e.g. «английский» for `en` in Russian (`Intl.DisplayNames`). */
export const languageName = (uiLanguage: string, code: string): string => {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** A language's name in itself, capitalized («Русский», «English»), for the reader's language switcher (I-08, #112). */
export const languageSelfName = (code: string): string => {
  const name = languageName(code, code);
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
};

/**
 * The writing direction of a language, set as `<html dir>` (I-09, #113). The layout uses logical
 * CSS (`ms-*`, `inset-s-*`, `text-start`) and mirrors direction-bearing icons under `rtl:`, so a
 * right-to-left language (Arabic) only needs its entry here: `ar: 'rtl'`.
 */
export const DIRECTIONS: Record<Language, 'ltr' | 'rtl'> = { ru: 'ltr', en: 'ltr' };

/** The `og:locale` of a language. */
export const OG_LOCALES: Record<Language, string> = { ru: 'ru_RU', en: 'en_US' };

/**
 * The `locale` query of an API request for content in a language: none for the default one, which
 * the API assumes, so the Russian requests stay as they were.
 */
export const articleLocaleQuery = (language: Language): string =>
  language === DEFAULT_LANGUAGE ? '' : `?locale=${language}`;
