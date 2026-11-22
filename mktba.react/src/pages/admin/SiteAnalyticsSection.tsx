import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLanguage, useLocale } from '../../localization/hooks';
import { type AnalyticsPeriodQuery, getSiteAnalytics } from '../../services/adminService';
import type { SiteAnalyticsDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
import { WebVitalsCard } from './WebVitalsCard';
import {
  CardHeading,
  ComparisonNote,
  CsvButton,
  FilterInput,
  Freshness,
  PeriodPicker,
  SchoolShares,
  StatCard,
} from './analyticsParts';
import { SECONDARY_COLOR, VIEWS_COLOR, dailyGeometry, formatDay, matchesFilter } from './analyticsFormat';
import { DEFAULT_PERIOD, articleStatsHref, periodKey } from './analyticsPeriod';

/** Yandex Metrika's own report, when this build has a counter (N-01): traffic sources and devices live there (D7). */
const metrikaCounterId = Number(import.meta.env.VITE_METRIKA_ID ?? 0);

const TEST_IDS = {
  views: 'site-analytics-views',
  visitors: 'site-analytics-visitors',
  searches: 'site-analytics-searches',
  day: 'site-analytics-day',
  schools: 'site-analytics-schools',
  freshness: 'site-analytics-freshness',
  comparison: 'site-analytics-comparison',
  filter: 'site-analytics-filter',
};

const AnalyticsBody: React.FC<{ data: SiteAnalyticsDto }> = ({ data }) => {
  const locale = useLocale();
  const language = useLanguage();
  const t = locale.siteAnalytics;
  const tools = locale.analyticsTools;
  const [filter, setFilter] = useState('');
  const topArticles = data.topArticles.filter((article) => matchesFilter(filter, article.title, article.slug));
  const previous = data.previous.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard testId={TEST_IDS.views} label={t.articleViews} value={data.totals.articleViews} previous={previous.articleViews} />
        <StatCard
          testId={TEST_IDS.visitors}
          label={t.visitors}
          value={data.totals.visitors}
          previous={previous.visitors}
          hint={t.visitorsHint}
        />
        <StatCard testId={TEST_IDS.searches} label={t.searches} value={data.totals.searches} previous={previous.searches} />
      </div>
      <ComparisonNote previous={data.previous} testId={TEST_IDS.comparison} />

      <Card className="p-6">
        <CardHeading title={t.dailyTitle}>
          <CsvButton
            table={t.dailyTitle}
            name="site-daily"
            period={data}
            rows={() => [
              [tools.dayColumn, t.articleViews, t.visitors, t.searches],
              ...data.daily.map((day) => [day.day, day.articleViews, day.visitors, day.searches]),
            ]}
          />
        </CardHeading>
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
            label: formatDay(language, day.day),
            title: formatMessage(t.daySummary, {
              date: formatDay(language, day.day),
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
          <CardHeading title={t.topArticlesTitle}>
            <CsvButton
              table={t.topArticlesTitle}
              name="site-top-articles"
              period={data}
              rows={() => [
                [tools.articleIdColumn, tools.titleColumn, tools.slugColumn, t.viewsColumn, t.readersColumn],
                ...topArticles.map((article) => [article.articleId, article.title, article.slug, article.views, article.readers]),
              ]}
            />
          </CardHeading>
          {data.topArticles.length > 0 ? (
            <div className="mt-3">
              <FilterInput value={filter} onChange={setFilter} testId={TEST_IDS.filter} />
            </div>
          ) : null}
          {topArticles.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{data.topArticles.length === 0 ? t.noArticles : tools.filterNothing}</p>
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
                {topArticles.map((article) => (
                  <tr key={article.articleId} className="border-t border-[var(--color-border-soft)]">
                    <td className="py-2 pr-3">
                      {article.slug ? (
                        <>
                          <Link to={`/${article.slug}`} className="text-[var(--color-brand-forest)] hover:underline">
                            {article.title}
                          </Link>
                          {' · '}
                          <Link
                            to={articleStatsHref(article.articleId, data)}
                            className="text-xs text-[var(--color-ink-muted)] hover:underline"
                          >
                            {tools.statsLink}
                          </Link>
                        </>
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
          <CardHeading title={t.schoolsTitle}>
            <CsvButton
              table={t.schoolsTitle}
              name="site-schools"
              period={data}
              rows={() => [
                [tools.schoolColumn, t.viewsColumn, t.readersColumn],
                ...data.schools.map((school) => [school.name ?? formatMessage(t.deletedSchool, { id: school.schoolId }), school.views, school.readers]),
                [t.withoutSchool, data.viewsWithoutSchool, null],
              ]}
            />
          </CardHeading>
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

      <WebVitalsCard webVitals={data.webVitals} />

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
  const [period, setPeriod] = useState<AnalyticsPeriodQuery>(DEFAULT_PERIOD);
  const query = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SITE_ANALYTICS, periodKey(period)],
    queryFn: () => getSiteAnalytics(period),
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
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {body()}
    </section>
  );
};
