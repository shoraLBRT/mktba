import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getMyActivity } from '../../services/profileService';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
import { EDITS_COLOR, PUBLICATIONS_COLOR, formatWeekStart } from './activityChart';

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

    return (
      <>
        <p data-testid="activity-totals" className="text-sm text-[var(--color-ink-default)]">
          {formatMessage(t.totals, { weeks: weeks.length, edits: totals.edits, publications: totals.publications })}
        </p>
        {totals.edits + totals.publications === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
        ) : null}

        <BarChart
          label={t.chartLabel}
          groupColumn={t.weekColumn}
          series={[
            { label: t.edits, color: EDITS_COLOR },
            { label: t.publications, color: PUBLICATIONS_COLOR },
          ]}
          groups={weeks.map((week) => ({
            key: week.weekStart,
            label: formatWeekStart(week.weekStart),
            title: formatMessage(t.weekSummary, {
              date: formatWeekStart(week.weekStart),
              edits: week.edits,
              publications: week.publications,
            }),
            values: [week.edits, week.publications],
          }))}
          maxWidth={672}
          groupTestId="activity-week"
        />
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
