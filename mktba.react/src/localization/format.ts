import type { Language } from './language';

/**
 * Plurals, numbers and dates in the reader's language (I-04, #108), on the browser's own `Intl`:
 * no i18n library, nothing added to the bundle.
 */

/** The CLDR plural categories `Intl.PluralRules` returns. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/**
 * A dictionary entry that depends on a number: one string per plural category of the language,
 * `other` always there (Russian: `one` 1, 21; `few` 2–4, 22; `many` 5–20, 25; `other` 1.5).
 * Written in the JSON as `{ "one": "…", "few": "…", "many": "…", "other": "…" }`.
 */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

/** Whether a dictionary value is a set of plural forms: only plural categories, `other` among them. */
export const isPluralForms = (value: unknown): value is PluralForms => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.includes('other')
    && keys.every((key) => (PLURAL_CATEGORIES as readonly string[]).includes(key)
      && typeof (value as Record<string, unknown>)[key] === 'string');
};

/** Fills `{name}` placeholders; a placeholder without a parameter stays as it is. */
export const formatMessage = (template: string, params: Record<string, string | number>): string =>
  Object.entries(params).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );

// Building an Intl formatter is the slow part, so each one is made once per language and options.
const cache = new Map<string, unknown>();
const cached = <T>(kind: string, language: Language, options: object, create: () => T): T => {
  const key = `${kind}|${language}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as T | undefined;
  if (formatter === undefined) {
    formatter = create();
    cache.set(key, formatter);
  }

  return formatter;
};

/** A number in the language's own way: «12 345,5» in Russian, «12,345.5» in English. */
export const formatNumber = (language: Language, value: number, options: Intl.NumberFormatOptions = {}): string =>
  cached('number', language, options, () => new Intl.NumberFormat(language, options)).format(value);

/**
 * The form of `forms` for `count` by the language's plural rules, with `{count}` as the number in
 * the language's way and any other parameters filled in.
 */
export const formatPlural = (
  language: Language,
  forms: PluralForms,
  count: number,
  params: Record<string, string | number> = {},
): string => {
  const category = cached('plural', language, {}, () => new Intl.PluralRules(language)).select(count);
  return formatMessage(forms[category] ?? forms.other, { count: formatNumber(language, count), ...params });
};

/**
 * Date styles of the site. The calendar ones are in UTC, so the server HTML, the hydration and every
 * reader see the same day; `dateTime` is the reader's local time and belongs only to pages rendered
 * after hydration (the admin, the editor).
 */
const DATE_STYLES = {
  /** «1 ноября 2026 г.» / «November 1, 2026». */
  long: { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  /** «01.11.2026» / «11/01/2026», for tables. */
  short: { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' },
  /** «1 нояб.» / «Nov 1», for days of the statistics (UTC, as the API counts them). */
  dayMonth: { day: 'numeric', month: 'short', timeZone: 'UTC' },
  /** «1 нояб. 2026 г.», local time. */
  mediumDate: { dateStyle: 'medium' },
  /** «01.11.2026, 14:05», local time. */
  shortDateTime: { dateStyle: 'short', timeStyle: 'short' },
  /** «1 нояб. 2026 г., 14:05», local time. */
  dateTime: { dateStyle: 'medium', timeStyle: 'short' },
  /** «1 ноября 2026 г. в 14:05», local time. */
  longDateTime: { dateStyle: 'long', timeStyle: 'short' },
  /** «1 ноября, 14:05», local time. */
  dayTime: { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** An API timestamp (ISO 8601) or a `Date` in one of the site's date styles and the given language. */
export const formatDate = (language: Language, value: string | Date, style: DateStyle = 'long'): string =>
  cached('date', language, DATE_STYLES[style], () => new Intl.DateTimeFormat(language, DATE_STYLES[style]))
    .format(typeof value === 'string' ? new Date(value) : value);
