import React, { useEffect, useMemo } from 'react';
import { LocalizationContext, type LocalizationContextValue } from './context';
import { dictionaryFor } from './index';
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

  const value = useMemo<LocalizationContextValue>(
    () => ({ language, locale: dictionaryFor(language) }),
    [language],
  );

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
};
