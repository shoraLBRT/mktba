import React, { useEffect, useMemo } from 'react';
import { LocalizationContext, type LocalizationContextValue } from './context';
import { dictionaries, type Locale } from './index';

export const LocalizationProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    document.documentElement.lang = 'ru';
  }, []);

  const value = useMemo<LocalizationContextValue>(
    () => ({
      locale: dictionaries.ru as Locale,
    }),
    [],
  );

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
};
