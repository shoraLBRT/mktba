import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
// Admin-only strings stay out of the eagerly loaded dictionaries, so out of the article page's first load.
import t from '../../localization/locales/ru/admin/siteAnalytics.json';
import { getSiteAnalytics } from '../../services/adminService';
import type { SiteAnalyticsDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';

/** The periods the dashboard offers, in days ending today (UTC). */
const SITE_ANALYTICS_PERIODS = [7, 30, 90] as const;

const TEST_IDS = {
  views: 'site-analytics-views',
  visitors: 'site-analytics-visitors',
  searches: 'site-analytics-searches',
  day: 'site-analytics-day',
};

const VIEWS_COLOR = 'var(--color-brand-forest)';
const VISITORS_COLOR = 'var(--color-ink-subtle)';

// Days are UTC calendar days (the API's), so they are printed in UTC too.
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

/** Yandex Metrika's own report, when this build has a counter (N-01): traffic sources and devices live there (D7). */
const metrikaCounterId = Number(import.meta.env.VITE_METRIKA_ID ?? 0);

const share = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');

const StatCard: React.FC<{ label: string; value: number; hint?: string; testId: string }> = ({ label, value, hint, testId }) => (
  <Card className="p-5" data-testid={testId}>
    <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{label}</p>
    <p className="mt-2 text-3xl font-bold text-[var(--color-ink-strong)]">{value}</p>
    {hint ? <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{hint}</p> : null}
  </Card>
);

const SchoolShares: React.FC<{ data: SiteAnalyticsDto }> = ({ data }) => {
  const rows = [
    ...data.schools.map((school) => ({
      key: `school-${school.schoolId}`,
      name: school.name ?? formatMessage(t.deletedSchool, { id: school.schoolId }),
      views: school.views,
    })),
    ...(data.viewsWithoutSchool > 0 ? [{ key: 'none', name: t.withoutSchool, views: data.viewsWithoutSchool }] : []),
  ];
  const total = data.totals.articleViews;
  if (rows.length === 0) return <p className="text-sm text-[var(--color-ink-muted)]">{t.noArticles}</p>;
  return (
    <ul className="space-y-2" data-testid="site-analytics-schools">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-[var(--color-ink-default)]">{row.name}</span>
            <span className="tabular-nums text-[var(--color-ink-muted)]">
              {row.views} · {share(row.views, total)}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[var(--color-border-soft)]" aria-hidden="true">
            <div
              className="h-1.5 rounded-full"
              style={{ width: share(row.views, total), background: row.key === 'none' ? VISITORS_COLOR : VIEWS_COLOR }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

const AnalyticsBody: React.FC<{ data: SiteAnalyticsDto }> = ({ data }) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard testId={TEST_IDS.views} label={t.articleViews} value={data.totals.articleViews} />
      <StatCard testId={TEST_IDS.visitors} label={t.visitors} value={data.totals.visitors} hint={t.visitorsHint} />
      <StatCard testId={TEST_IDS.searches} label={t.searches} value={data.totals.searches} />
    </div>

    <Card className="p-6">
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.dailyTitle}</h3>
      {data.totals.articleViews + data.totals.visitors + data.totals.searches === 0 ? (
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
      ) : null}
      <BarChart
        label={t.dailyLabel}
        groupColumn={t.dayColumn}
        series={[
          { label: t.articleViews, color: VIEWS_COLOR },
          { label: t.visitors, color: VISITORS_COLOR },
        ]}
        groups={data.daily.map((day) => ({
          key: day.day,
          label: formatDay(day.day),
          title: formatMessage(t.daySummary, {
            date: formatDay(day.day),
            views: day.articleViews,
            visitors: day.visitors,
            searches: day.searches,
          }),
          values: [day.articleViews, day.visitors],
        }))}
        // About 640 px whatever the period: wide bars for a week, thin ones for a quarter.
        geometry={{ barWidth: Math.max(1, Math.min(24, Math.floor((640 / data.daily.length - 3) / 2))), barGap: 1, groupGap: 2 }}
        groupTestId={TEST_IDS.day}
      />
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.topArticlesTitle}</h3>
        {data.topArticles.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.noArticles}</p>
        ) : (
          <table className="mt-3 w-full text-sm" data-testid="site-analytics-top-articles">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
                <th scope="col" className="pb-2 font-semibold">{t.articleColumn}</th>
                <th scope="col" className="pb-2 text-right font-semibold">{t.viewsColumn}</th>
                <th scope="col" className="pb-2 text-right font-semibold">{t.readersColumn}</th>
              </tr>
            </thead>
            <tbody>
              {data.topArticles.map((article) => (
                <tr key={article.articleId} className="border-t border-[var(--color-border-soft)]">
                  <td className="py-2 pr-3">
                    {article.slug ? (
                      <Link to={`/${article.slug}`} className="text-[var(--color-brand-forest)] hover:underline">
                        {article.title}
                      </Link>
                    ) : (
                      <span className="text-[var(--color-ink-muted)]">
                        {formatMessage(t.deletedArticle, { id: article.articleId })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{article.views}</td>
                  <td className="py-2 text-right tabular-nums">{article.readers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.schoolsTitle}</h3>
        <p className="mt-1 mb-3 text-sm text-[var(--color-ink-muted)]">{t.schoolsDescription}</p>
        <SchoolShares data={data} />
      </Card>
    </div>

    <Card className="p-6" data-testid="site-analytics-metrika">
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.metrikaTitle}</h3>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.metrikaDescription}</p>
      {metrikaCounterId ? (
        <a
          href={`https://metrika.yandex.ru/dashboard?id=${metrikaCounterId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-[var(--color-brand-forest)] hover:underline"
        >
          {t.metrikaLink}
        </a>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.metrikaMissing}</p>
      )}
    </Card>

    <p className="text-xs text-[var(--color-ink-muted)]" data-testid="site-analytics-freshness">
      {data.aggregatedAtUtc
        ? formatMessage(t.aggregatedAt, { time: timeFormat.format(new Date(data.aggregatedAtUtc)) })
        : t.notAggregated}
    </p>
  </div>
);

/**
 * The site's own statistics on `/admin` (N-05, #99), for admins only: views, visitors and searches
 * per day, the most viewed articles and the mazhabs readers chose, over a chosen period, read from
 * the daily summaries (`GET /analytics/site`). Traffic sources and devices are Yandex Metrika's (D7).
 */
export const SiteAnalyticsSection: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SITE_ANALYTICS, days],
    queryFn: () => getSiteAnalytics(days),
  });

  const body = () => {
    if (query.isError) return <p className="text-sm text-red-700">{t.loadFailed}</p>;
    if (!query.data) return <p className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>;
    return <AnalyticsBody data={query.data} />;
  };

  return (
    <section className="space-y-4" data-testid="site-analytics" aria-labelledby="site-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="site-analytics-title" className="text-lg font-semibold text-[var(--color-ink-strong)]">
            {t.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">{t.description}</p>
        </div>
        <div role="group" aria-label={t.periodLabel} className="inline-flex rounded-lg border border-[var(--color-border-soft)] p-0.5">
          {SITE_ANALYTICS_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={days === period}
              onClick={() => setDays(period)}
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
      </div>
      {body()}
    </section>
  );
};
