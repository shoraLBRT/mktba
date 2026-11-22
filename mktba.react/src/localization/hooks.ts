import { useCallback, useContext, useMemo } from 'react';
import { LocalizationContext } from './context';
import { formatDate, formatNumber, formatPlural, type DateStyle, type PluralForms } from './format';
import { localizedPath } from './language';

const useLocalizationContext = () => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('Localization hooks must be used within LocalizationProvider.');
  }

  return context;
};

export const useLocale = () => useLocalizationContext().locale;
export const useLocalization = () => useLocalizationContext();
/** The reader's language, from the URL. */
export const useLanguage = () => useLocalizationContext().language;

/**
 * Turns a site path into the reader's language (`/search` → `/en/search` on an English page), for
 * the links of the site's own pages. An article's link keeps the article's language instead.
 */
export const useLocalizedPath = () => {
  const language = useLanguage();
  return useCallback((path: string) => localizedPath(language, path), [language]);
};

/**
 * Plurals, numbers and dates in the reader's language (I-04, #108): `plural(t.found, 5)`,
 * `number(12345)`, `date(iso)` / `date(iso, 'short')`. Never a hard-coded `'ru-RU'`.
 */
export const useFormat = () => {
  const language = useLanguage();
  return useMemo(
    () => ({
      plural: (forms: PluralForms, count: number, params?: Record<string, string | number>) =>
        formatPlural(language, forms, count, params),
      number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(language, value, options),
      date: (value: string | Date, style?: DateStyle) => formatDate(language, value, style),
    }),
    [language],
  );
};
