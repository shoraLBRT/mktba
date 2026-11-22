import { formatDate } from '../../localization/format';
import type { Language } from '../../localization/language';

/** The numbers and colors the statistics dashboards share: the site's (N-05, #99) and the author's (P-03, #91). */

/** The periods the dashboards offer, in days ending today (UTC). */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;

export const VIEWS_COLOR = 'var(--color-brand-forest)';
export const SECONDARY_COLOR = 'var(--color-ink-subtle)';

// Days are UTC calendar days (the API's), so they are printed in UTC too.
export const formatDay = (language: Language, day: string) => formatDate(language, `${day}T00:00:00Z`, 'dayMonth');

/** `part` as a whole percentage of `total`; 0% of nothing. */
export const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

/** Bars about 640 px wide whatever the period: wide bars for a week, thin ones for a quarter. */
export const dailyGeometry = (days: number) => ({
  barWidth: Math.max(1, Math.min(24, Math.floor((640 / days - 3) / 2))),
  barGap: 1,
  groupGap: 2,
});

/** Whether the texts together contain every word of the table filter (N-08), ignoring case. */
export const matchesFilter = (filter: string, ...texts: (string | null | undefined)[]) => {
  const words = filter.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.filter(Boolean).join(' ').toLocaleLowerCase('ru');
  return words.every((word) => haystack.includes(word));
};
