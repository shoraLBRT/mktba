import type { AnalyticsPeriodQuery } from '../../services/adminService';

/**
 * The period a statistics dashboard shows (N-08, #102): the last 7 / 30 / 90 days ending today, or a
 * range of UTC days picked by hand. The API takes either (`days`, or `from` and `to`) and answers
 * with the period's totals and those of as many days just before it.
 */

/** The longest range the API reads (`AnalyticsPeriod.MaxDays`). */
export const MAX_PERIOD_DAYS = 365;

export const DEFAULT_PERIOD: AnalyticsPeriodQuery = { days: 30 };

/** Today as the API counts it: the UTC calendar day, `yyyy-MM-dd`. */
export const todayUtc = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/** A query key part that tells periods apart. */
export const periodKey = (period: AnalyticsPeriodQuery) =>
  'days' in period ? `days:${period.days}` : `${period.from}..${period.to}`;

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** Why a picked range cannot be asked for, or null when it can. */
export const rangeError = (from: string, to: string): 'invalid' | 'tooLong' | null => {
  if (!from || !to || Number.isNaN(dayNumber(from)) || Number.isNaN(dayNumber(to))) return 'invalid';
  if (dayNumber(from) > dayNumber(to)) return 'invalid';
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_PERIOD_DAYS) return 'tooLong';
  return null;
};

/** `days` days ending `to`, both ends included, as `yyyy-MM-dd`. */
export const rangeEnding = (to: string, days: number) => {
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: todayUtc(from), to };
};

/** The statistics page of one article over the same days as the dashboard it was opened from (drill-down, N-08). */
export const articleStatsHref = (articleId: number, period?: { from: string; to: string }) =>
  `/admin/articles/${articleId}/analytics${period ? `?from=${period.from}&to=${period.to}` : ''}`;

/**
 * The period a page was opened with (`?from=&to=`, see `articleStatsHref`): a preset when the range
 * is one ending today, the range itself otherwise, the default when there is none or it is wrong.
 */
export const periodFromSearch = (search: URLSearchParams, presets: readonly number[], today: string = todayUtc()): AnalyticsPeriodQuery => {
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || rangeError(from, to) || to > today) return DEFAULT_PERIOD;
  const days = dayNumber(to) - dayNumber(from) + 1;
  return to === today && presets.includes(days) ? { days } : { from, to };
};
