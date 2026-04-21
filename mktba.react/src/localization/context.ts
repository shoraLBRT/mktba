import { createContext } from 'react';
import type { Locale } from './index';

export type LocalizationContextValue = {
  locale: Locale;
};

export const LocalizationContext = createContext<LocalizationContextValue | null>(null);
