import { dictionaries as loadedDictionaries } from './loader';

export const dictionaries = loadedDictionaries as typeof loadedDictionaries & {
  ru: typeof import('./locales/ru/brand.json')
    & typeof import('./locales/ru/shared.json')
    & typeof import('./locales/ru/pages.json')
    & typeof import('./locales/ru/editor.json');
};

export type SupportedLocale = keyof typeof dictionaries;
export type Locale = (typeof dictionaries)['ru'];

export const locale: Locale = dictionaries.ru;

export const formatMessage = (template: string, params: Record<string, string | number>): string =>
  Object.entries(params).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
