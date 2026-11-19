const russianDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * An API timestamp (UTC, ISO 8601) as a Russian calendar date, e.g. «1 ноября 2026 г.».
 * Dates are shown in UTC so every reader sees the same day.
 */
export const formatRussianDate = (iso: string): string => russianDate.format(new Date(iso));
