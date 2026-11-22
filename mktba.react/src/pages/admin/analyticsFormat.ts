/** The numbers and colors the statistics dashboards share: the site's (N-05, #99) and the author's (P-03, #91). */

/** The periods the dashboards offer, in days ending today (UTC). */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;

export const VIEWS_COLOR = 'var(--color-brand-forest)';
export const SECONDARY_COLOR = 'var(--color-ink-subtle)';

// Days are UTC calendar days (the API's), so they are printed in UTC too.
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
export const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/** `part` as a whole percentage of `total`; 0% of nothing. */
export const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

/** Bars about 640 px wide whatever the period: wide bars for a week, thin ones for a quarter. */
export const dailyGeometry = (days: number) => ({
  barWidth: Math.max(1, Math.min(24, Math.floor((640 / days - 3) / 2))),
  barGap: 1,
  groupGap: 2,
});
