import React from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { AnalyticsSchoolTotalDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { ANALYTICS_PERIODS, SECONDARY_COLOR, VIEWS_COLOR, share, timeFormat } from './analyticsFormat';

/**
 * The pieces the statistics dashboards share: the site's (N-05, #99) and the author's (P-03, #91).
 */

export const StatCard: React.FC<{ label: string; value: number | string; hint?: string; testId: string }> = ({ label, value, hint, testId }) => (
  <Card className="p-5" data-testid={testId}>
    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</p>
    <p className="mt-2 text-3xl font-bold text-[var(--color-ink-strong)]">{value}</p>
    {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
  </Card>
);

/** The 7 / 30 / 90 days switch. */
export const PeriodSwitch: React.FC<{ days: number; onChange: (days: number) => void }> = ({ days, onChange }) => {
  const t = useLocale().siteAnalytics;
  return (
    <div role="group" aria-label={t.periodLabel} className="inline-flex rounded-lg border border-[var(--color-border-soft)] p-0.5">
      {ANALYTICS_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={days === period}
          onClick={() => onChange(period)}
          className={`rounded-md px-3 py-1 text-sm ${
            days === period
              ? 'bg-[var(--color-brand-forest)] text-white'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink-strong)]'
          }`}
        >
          {formatMessage(t.periodDays, { days: period })}
        </button>
      ))}
    </div>
  );
};

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
  return (
    <p className="text-xs text-[var(--color-ink-muted)]" data-testid={testId}>
      {aggregatedAtUtc ? formatMessage(t.aggregatedAt, { time: timeFormat.format(new Date(aggregatedAtUtc)) }) : t.notAggregated}
    </p>
  );
};
