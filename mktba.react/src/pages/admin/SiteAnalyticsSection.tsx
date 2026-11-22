import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getSiteAnalytics } from '../../services/adminService';
import type { SiteAnalyticsDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
import { Freshness, PeriodSwitch, SchoolShares, StatCard } from './analyticsParts';
import { SECONDARY_COLOR, VIEWS_COLOR, dailyGeometry, formatDay } from './analyticsFormat';

/** Yandex Metrika's own report, when this build has a counter (N-01): traffic sources and devices live there (D7). */
const metrikaCounterId = Number(import.meta.env.VITE_METRIKA_ID ?? 0);

const TEST_IDS = {
  views: 'site-analytics-views',
  visitors: 'site-analytics-visitors',
  searches: 'site-analytics-searches',
  day: 'site-analytics-day',
  schools: 'site-analytics-schools',
  freshness: 'site-analytics-freshness',
};

const AnalyticsBody: React.FC<{ data: SiteAnalyticsDto }> = ({ data }) => {
  const t = useLocale().siteAnalytics;
  return (
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
            { label: t.visitors, color: SECONDARY_COLOR },
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
          geometry={dailyGeometry(data.daily.length)}
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
          <SchoolShares
            schools={data.schools}
            viewsWithoutSchool={data.viewsWithoutSchool}
            totalViews={data.totals.articleViews}
            emptyText={t.noArticles}
            testId={TEST_IDS.schools}
          />
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

      <Freshness aggregatedAtUtc={data.aggregatedAtUtc} testId={TEST_IDS.freshness} />
    </div>
  );
};

/**
 * The site's own statistics on `/admin` (N-05, #99), for admins only: views, visitors and searches
 * per day, the most viewed articles and the mazhabs readers chose, over a chosen period, read from
 * the daily summaries (`GET /analytics/site`). Traffic sources and devices are Yandex Metrika's (D7).
 */
export const SiteAnalyticsSection: React.FC = () => {
  const t = useLocale().siteAnalytics;
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
        <PeriodSwitch days={days} onChange={setDays} />
      </div>
      {body()}
    </section>
  );
};
