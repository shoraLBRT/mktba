import { useCallback, useContext } from 'react';
import { LocalizationContext } from './context';
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
