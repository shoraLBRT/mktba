import React, { use, useEffect, useMemo } from 'react';
import { LocalizationContext, type LocalizationContextValue } from './context';
import { dictionaryFor, isLanguageLoaded, loadLanguage } from './index';
import { DEFAULT_LANGUAGE, type Language } from './language';

type LocalizationProviderProps = {
  /** The reader's language: the root passes the one of the URL (`languageFromPath`). */
  language?: Language;
  children: React.ReactNode;
};

export const LocalizationProvider = ({ language = DEFAULT_LANGUAGE, children }: LocalizationProviderProps) => {
  // The root's `<html lang>` carries it in the server HTML; this keeps it right where no root renders it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // A language whose strings are not loaded yet (a navigation from `/` into `/en/`) suspends until
  // they are; navigations are transitions, so the previous page stays on screen meanwhile. The first
  // page's language is loaded before hydration (`entry.client.tsx`) and before the server render.
  if (!isLanguageLoaded(language)) {
    use(loadLanguage(language));
  }

  const loaded = isLanguageLoaded(language);
  const value = useMemo<LocalizationContextValue>(
    () => ({ language, locale: dictionaryFor(language) }),
    // `loaded` is in the deps so the value is rebuilt once the language's dictionary exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, loaded],
  );

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
};
