import React, { useId, useState } from 'react';
import { formatMessage } from '../../localization';
import { useLanguage, useLocale } from '../../localization/hooks';
import type { AnalyticsPeriodQuery } from '../../services/adminService';
import type { AnalyticsSchoolTotalDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { ANALYTICS_PERIODS, SECONDARY_COLOR, VIEWS_COLOR, formatDay, share } from './analyticsFormat';
import { formatDate } from '../../localization/format';
import { type CsvCell, csvFileName, downloadCsv } from './analyticsCsv';
import { MAX_PERIOD_DAYS, rangeEnding, rangeError, todayUtc } from './analyticsPeriod';

/**
 * The pieces the statistics dashboards share: the site's (N-05, #99), the author's (P-03, #91), search
 * (N-06), content (N-07), an article's (N-09) — and their data tools (N-08, #102): the period picker,
 * the comparison with the previous period, the table filter and the CSV export.
 */

type StatCardProps = {
  label: string;
  value: number | string;
  hint?: string;
  testId: string;
  /** The same total over the previous period: shows the change (N-08). */
  previous?: number;
};

/** The change of a total against the previous period, in words. */
const useChangeText = () => {
  const t = useLocale().analyticsTools;
  return (value: number, previous: number) => {
    if (value === previous) return t.changeSame;
    if (previous === 0) return t.changeFromZero;
    const percent = Math.round((Math.abs(value - previous) / previous) * 100);
    return formatMessage(value > previous ? t.changeUp : t.changeDown, { percent, previous });
  };
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, testId, previous }) => {
  const changeText = useChangeText();
  return (
    <Card className="p-5" data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[var(--color-ink-strong)]">{value}</p>
      {previous !== undefined && typeof value === 'number' ? (
        <p className="mt-1 text-xs font-medium text-[var(--color-ink-default)]" data-testid={`${testId}-change`}>
          {changeText(value, previous)}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
    </Card>
  );
};

/** The dates the totals are compared with. */
export const ComparisonNote: React.FC<{ previous: { from: string; to: string }; testId: string }> = ({ previous, testId }) => {
  const t = useLocale().analyticsTools;
  const language = useLanguage();
  return (
    <p className="text-xs text-[var(--color-ink-muted)]" data-testid={testId}>
      {formatMessage(t.comparedWith, { from: formatDay(language, previous.from), to: formatDay(language, previous.to) })}
    </p>
  );
};

const choiceClass = (active: boolean) =>
  `rounded-md px-3 py-1 text-sm ${
    active ? 'bg-[var(--color-brand-forest)] text-white' : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink-strong)]'
  }`;

const dateInputClass =
  'rounded-md border border-[var(--color-border-soft)] bg-white px-2 py-1 text-sm text-[var(--color-ink-default)]';

/**
 * The period of a dashboard: 7 / 30 / 90 days ending today, or a range of UTC days picked by hand
 * (N-08), asked for once both dates are set and «Показать» is pressed.
 */
export const PeriodPicker: React.FC<{ value: AnalyticsPeriodQuery; onChange: (period: AnalyticsPeriodQuery) => void }> = ({
  value,
  onChange,
}) => {
  const common = useLocale().siteAnalytics;
  const t = useLocale().analyticsTools;
  const id = useId();
  const today = todayUtc();
  const [custom, setCustom] = useState('from' in value);
  const [draft, setDraft] = useState(() => ('from' in value ? value : rangeEnding(today, 'days' in value ? value.days : 30)));
  const error = rangeError(draft.from, draft.to);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (!error) onChange({ from: draft.from, to: draft.to });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div role="group" aria-label={common.periodLabel} className="inline-flex flex-wrap rounded-lg border border-[var(--color-border-soft)] p-0.5">
        {ANALYTICS_PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={!custom && 'days' in value && value.days === period}
            onClick={() => {
              setCustom(false);
              onChange({ days: period });
            }}
            className={choiceClass(!custom && 'days' in value && value.days === period)}
          >
            {formatMessage(common.periodDays, { days: period })}
          </button>
        ))}
        <button type="button" aria-pressed={custom} onClick={() => setCustom(true)} className={choiceClass(custom)}>
          {t.customPeriod}
        </button>
      </div>
      {custom ? (
        <form className="flex flex-wrap items-end justify-end gap-2" onSubmit={apply} aria-label={t.customPeriod}>
          <label className="flex flex-col text-xs text-[var(--color-ink-muted)]" htmlFor={`${id}-from`}>
            {t.fromLabel}
            <input
              id={`${id}-from`}
              type="date"
              className={dateInputClass}
              value={draft.from}
              max={draft.to || today}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--color-ink-muted)]" htmlFor={`${id}-to`}>
            {t.toLabel}
            <input
              id={`${id}-to`}
              type="date"
              className={dateInputClass}
              value={draft.to}
              min={draft.from || undefined}
              max={today}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <button
            type="submit"
            disabled={error !== null}
            className="rounded-md bg-[var(--color-brand-forest)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {t.applyPeriod}
          </button>
          {error ? (
            <p className="w-full text-right text-xs text-red-700" role="alert">
              {error === 'tooLong' ? formatMessage(t.periodTooLong, { maxDays: MAX_PERIOD_DAYS }) : t.periodInvalid}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
};

/** The text filter of a dashboard's tables (N-08): it narrows every table of the section, and their CSV. */
export const FilterInput: React.FC<{ value: string; onChange: (value: string) => void; testId: string }> = ({ value, onChange, testId }) => {
  const t = useLocale().analyticsTools;
  const id = useId();
  return (
    <div className="flex flex-col gap-1 sm:max-w-sm">
      <label htmlFor={id} className="text-xs text-[var(--color-ink-muted)]">{t.filterLabel}</label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={t.filterPlaceholder}
        onChange={(event) => onChange(event.target.value)}
        className={dateInputClass}
        data-testid={testId}
      />
    </div>
  );
};

type CsvButtonProps = {
  /** The table's name, for the button's label. */
  table: string;
  /** The file name's part: `analytics-<name>-<from>-<to>.csv`. */
  name: string;
  period: { from: string; to: string };
  /** The header first; built when the button is pressed. */
  rows: () => CsvCell[][];
};

/** Saves one table as CSV (N-08). */
export const CsvButton: React.FC<CsvButtonProps> = ({ table, name, period, rows }) => {
  const t = useLocale().analyticsTools;
  return (
    <button
      type="button"
      onClick={() => downloadCsv(csvFileName(name, period), rows())}
      aria-label={formatMessage(t.csvLabel, { table })}
      title={formatMessage(t.csvLabel, { table })}
      className="rounded-md border border-[var(--color-border-soft)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink-strong)]"
    >
      {t.csv}
    </button>
  );
};

/** A card's heading with its CSV button on the right. */
export const CardHeading: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="flex items-start justify-between gap-3">
    <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{title}</h3>
    {children}
  </div>
);

type SchoolSharesProps = {
  schools: AnalyticsSchoolTotalDto[];
  viewsWithoutSchool: number;
  /** The views the shares are of. */
  totalViews: number;
  emptyText: string;
  testId: string;
};

/** Article views by the mazhab the reader had chosen, with a bar per mazhab and one for «not chosen». */
export const SchoolShares: React.FC<SchoolSharesProps> = ({ schools, viewsWithoutSchool, totalViews, emptyText, testId }) => {
  const t = useLocale().siteAnalytics;
  const rows = [
    ...schools.map((school) => ({
      key: `school-${school.schoolId}`,
      name: school.name ?? formatMessage(t.deletedSchool, { id: school.schoolId }),
      views: school.views,
    })),
    ...(viewsWithoutSchool > 0 ? [{ key: 'none', name: t.withoutSchool, views: viewsWithoutSchool }] : []),
  ];
  if (rows.length === 0) return <p className="text-sm text-[var(--color-ink-muted)]">{emptyText}</p>;
  return (
    <ul className="space-y-2" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-[var(--color-ink-default)]">{row.name}</span>
            <span className="tabular-nums text-[var(--color-ink-muted)]">
              {row.views} · {share(row.views, totalViews)}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[var(--color-border-soft)]" aria-hidden="true">
            <div
              className="h-1.5 rounded-full"
              style={{ width: share(row.views, totalViews), background: row.key === 'none' ? SECONDARY_COLOR : VIEWS_COLOR }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** When the summaries were last rebuilt. */
export const Freshness: React.FC<{ aggregatedAtUtc?: string | null; testId: string }> = ({ aggregatedAtUtc, testId }) => {
  const t = useLocale().siteAnalytics;
  const language = useLanguage();
  return (
    <p className="text-xs text-[var(--color-ink-muted)]" data-testid={testId}>
      {aggregatedAtUtc ? formatMessage(t.aggregatedAt, { time: formatDate(language, aggregatedAtUtc, 'shortDateTime') }) : t.notAggregated}
    </p>
  );
};
