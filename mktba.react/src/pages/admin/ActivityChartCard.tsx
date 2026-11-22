import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getMyActivity } from '../../services/profileService';
import { Card } from '../../shared/ui/Card';
import {
  AXIS_WIDTH,
  BAR_WIDTH,
  EDITS_COLOR,
  PLOT_HEIGHT,
  PLOT_TOP,
  PUBLICATIONS_COLOR,
  chartLayout,
  formatWeekStart,
} from './activityChart';

/**
 * «Моя активность» on `/admin/profile` (P-04, #92): the signed-in user's own saved revisions and
 * first publications per week, as plain SVG bars with the numbers in a table for screen readers.
 * Not shown to readers: the docs give the activity chart to the author's own profile only.
 */
export const ActivityChartCard: React.FC = () => {
  const t = useLocale().activityChart;
  const activityQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.MY_ACTIVITY], queryFn: () => getMyActivity() });
  const weeks = activityQuery.data?.weeks ?? [];
  const totals = weeks.reduce(
    (sum, week) => ({ edits: sum.edits + week.edits, publications: sum.publications + week.publications }),
    { edits: 0, publications: 0 },
  );

  const body = () => {
    if (activityQuery.isError) return <p className="text-sm text-red-700">{t.loadFailed}</p>;
    if (activityQuery.isLoading) return <p className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>;

    const layout = chartLayout(weeks);
    const baseline = PLOT_TOP + PLOT_HEIGHT;
    return (
      <>
        <p data-testid="activity-totals" className="text-sm text-[var(--color-ink-default)]">
          {formatMessage(t.totals, { weeks: weeks.length, edits: totals.edits, publications: totals.publications })}
        </p>
        {totals.edits + totals.publications === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
        ) : null}

        <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--color-ink-muted)]" aria-hidden="true">
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: EDITS_COLOR }} />
            {t.edits}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PUBLICATIONS_COLOR }} />
            {t.publications}
          </li>
        </ul>

        <svg
          role="img"
          aria-label={t.chartLabel}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mt-2 block h-auto w-full max-w-2xl"
        >
          <line x1={AXIS_WIDTH} x2={layout.width} y1={PLOT_TOP} y2={PLOT_TOP} stroke="var(--color-border-soft)" strokeDasharray="3 3" />
          <line x1={AXIS_WIDTH} x2={layout.width} y1={baseline} y2={baseline} stroke="var(--color-border-soft)" />
          <text x={AXIS_WIDTH - 4} y={PLOT_TOP + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-muted)">
            {layout.max}
          </text>
          <text x={AXIS_WIDTH - 4} y={baseline} textAnchor="end" fontSize="10" fill="var(--color-ink-muted)">
            {0}
          </text>
          {layout.bars.map((bar) => (
            <g key={bar.week.weekStart} data-testid="activity-week">
              <title>
                {formatMessage(t.weekSummary, {
                  date: formatWeekStart(bar.week.weekStart),
                  edits: bar.week.edits,
                  publications: bar.week.publications,
                })}
              </title>
              <rect x={bar.x} y={baseline - bar.editsHeight} width={BAR_WIDTH} height={bar.editsHeight} rx="1.5" fill={EDITS_COLOR} />
              <rect
                x={bar.x + BAR_WIDTH + 2}
                y={baseline - bar.publicationsHeight}
                width={BAR_WIDTH}
                height={bar.publicationsHeight}
                rx="1.5"
                fill={PUBLICATIONS_COLOR}
              />
              {bar.labelled ? (
                <text x={bar.x + BAR_WIDTH + 1} y={baseline + 14} textAnchor="middle" fontSize="9" fill="var(--color-ink-muted)">
                  {formatWeekStart(bar.week.weekStart)}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        <table className="sr-only">
          <caption>{t.chartLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{t.weekColumn}</th>
              <th scope="col">{t.edits}</th>
              <th scope="col">{t.publications}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekStart}>
                <th scope="row">{formatWeekStart(week.weekStart)}</th>
                <td>{week.edits}</td>
                <td>{week.publications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  return (
    <Card className="p-6" data-testid="activity-chart">
      <h2 className="text-lg font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
      <p className="mt-1 mb-4 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      {body()}
    </Card>
  );
};
