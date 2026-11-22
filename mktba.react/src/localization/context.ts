import { createContext } from 'react';
import type { Locale } from './index';
import type { Language } from './language';

export type LocalizationContextValue = {
  /** The reader's language, from the URL (I-01, #105). */
  language: Language;
  locale: Locale;
};

export const LocalizationContext = createContext<LocalizationContextValue | null>(null);
