import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { type AnalyticsPeriodQuery, getAuthorAnalytics } from '../../services/adminService';
import type { AuthorAnalyticsDto, ReadDepthDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
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
import { SECONDARY_COLOR, VIEWS_COLOR, dailyGeometry, formatDay, matchesFilter, share } from './analyticsFormat';
import { DEFAULT_PERIOD, articleStatsHref, periodKey } from './analyticsPeriod';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const AUTHOR_ANALYTICS_QUERY_KEY = 'authorAnalytics';

const TEST_IDS = {
  views: 'author-analytics-views',
  readers: 'author-analytics-readers',
  articles: 'author-analytics-articles',
  finished: 'author-analytics-finished',
  day: 'author-analytics-day',
  schools: 'author-analytics-schools',
  freshness: 'author-analytics-freshness',
  comparison: 'author-analytics-comparison',
  filter: 'author-analytics-filter',
};

const DEPTHS: { key: keyof Omit<ReadDepthDto, 'views'>; label: 'depth25' | 'depth50' | 'depth75' | 'depth100' }[] = [
  { key: 'reachedDepth25', label: 'depth25' },
  { key: 'reachedDepth50', label: 'depth50' },
  { key: 'reachedDepth75', label: 'depth75' },
  { key: 'reachedDepth100', label: 'depth100' },
];

/** How far the views got, as bars of the share of views; also on the article statistics page (N-09, #103). */
export const DepthBars: React.FC<{ depth: ReadDepthDto; testId?: string }> = ({ depth, testId = 'author-analytics-depth' }) => {
  const t = useLocale().authorDashboard;
  return (
    <ul className="space-y-2" data-testid={testId}>
      {DEPTHS.map(({ key, label }) => (
        <li key={key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-[var(--color-ink-default)]">{t[label]}</span>
            <span className="tabular-nums text-[var(--color-ink-muted)]">
              {depth[key]} · {share(depth[key], depth.views)}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-[var(--color-border-soft)]" aria-hidden="true">
            <div className="h-1.5 rounded-full" style={{ width: share(depth[key], depth.views), background: VIEWS_COLOR }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

const AnalyticsBody: React.FC<{ data: AuthorAnalyticsDto }> = ({ data }) => {
  const locale = useLocale();
  const t = locale.authorDashboard;
  const common = locale.siteAnalytics;
  const tools = locale.analyticsTools;
  const [filter, setFilter] = useState('');
  const topArticles = data.topArticles.filter((article) => matchesFilter(filter, article.title, article.slug));
  const previous = data.previous.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard testId={TEST_IDS.views} label={t.views} value={data.totals.views} previous={previous.views} />
        <StatCard testId={TEST_IDS.readers} label={t.readers} value={data.totals.readers} previous={previous.readers} hint={t.readersHint} />
        <StatCard
          testId={TEST_IDS.articles}
          label={t.articlesViewed}
          value={data.totals.articlesViewed}
          previous={previous.articlesViewed}
        />
        <StatCard
          testId={TEST_IDS.finished}
          label={t.finished}
          value={share(data.depth.reachedDepth100, data.depth.views)}
          hint={t.finishedHint}
        />
      </div>
      <ComparisonNote previous={data.previous} testId={TEST_IDS.comparison} />

      <Card className="p-6">
        <CardHeading title={t.dailyTitle}>
          <CsvButton
            table={t.dailyTitle}
            name="my-daily"
            period={data}
            rows={() => [[tools.dayColumn, t.views, t.readers], ...data.daily.map((day) => [day.day, day.views, day.readers])]}
          />
        </CardHeading>
        {data.totals.views === 0 ? <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.empty}</p> : null}
        <BarChart
          label={t.dailyLabel}
          groupColumn={common.dayColumn}
          series={[
            { label: t.views, color: VIEWS_COLOR },
            { label: t.readers, color: SECONDARY_COLOR },
          ]}
          groups={data.daily.map((day) => ({
            key: day.day,
            label: formatDay(day.day),
            title: formatMessage(t.daySummary, { date: formatDay(day.day), views: day.views, readers: day.readers }),
            values: [day.views, day.readers],
          }))}
          geometry={dailyGeometry(data.daily.length)}
          groupTestId={TEST_IDS.day}
        />
      </Card>

      <Card className="p-6">
        <CardHeading title={t.topArticlesTitle}>
          <CsvButton
            table={t.topArticlesTitle}
            name="my-top-articles"
            period={data}
            rows={() => [
              [tools.articleIdColumn, tools.titleColumn, tools.slugColumn, common.viewsColumn, common.readersColumn, t.finishedColumn],
              ...topArticles.map((article) => [
                article.articleId,
                article.title,
                article.slug,
                article.views,
                article.readers,
                share(article.depth.reachedDepth100, article.depth.views),
              ]),
            ]}
          />
        </CardHeading>
        {data.topArticles.length > 0 ? (
          <div className="mt-3">
            <FilterInput value={filter} onChange={setFilter} testId={TEST_IDS.filter} />
          </div>
        ) : null}
        {topArticles.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{data.topArticles.length === 0 ? t.empty : tools.filterNothing}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm" data-testid="author-analytics-top-articles">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
                  <th scope="col" className="pb-2 font-semibold">{common.articleColumn}</th>
                  <th scope="col" className="pb-2 text-right font-semibold">{common.viewsColumn}</th>
                  <th scope="col" className="pb-2 text-right font-semibold">{common.readersColumn}</th>
                  <th scope="col" className="pb-2 text-right font-semibold">{t.finishedColumn}</th>
                </tr>
              </thead>
              <tbody>
                {topArticles.map((article) => (
                  <tr key={article.articleId} className="border-t border-[var(--color-border-soft)]">
                    <td className="py-2 pr-3">
                      <Link to={`/${article.slug}`} className="text-[var(--color-brand-forest)] hover:underline">
                        {article.title}
                      </Link>
                      {' · '}
                      <Link
                        to={articleStatsHref(article.articleId, data)}
                        className="text-xs text-[var(--color-ink-muted)] hover:underline"
                      >
                        {locale.articleAnalytics.openLink}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{article.views}</td>
                    <td className="py-2 text-right tabular-nums">{article.readers}</td>
                    <td className="py-2 text-right tabular-nums">{share(article.depth.reachedDepth100, article.depth.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.depthTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-[var(--color-ink-muted)]">{t.depthDescription}</p>
          <DepthBars depth={data.depth} />
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.schoolsTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-[var(--color-ink-muted)]">{t.schoolsDescription}</p>
          <SchoolShares
            schools={data.schools}
            viewsWithoutSchool={data.viewsWithoutSchool}
            totalViews={data.depth.views}
            emptyText={t.empty}
            testId={TEST_IDS.schools}
          />
        </Card>
      </div>

      <p className="text-sm text-[var(--color-ink-muted)]" data-testid="author-analytics-search-note">{t.searchNote}</p>
      <Freshness aggregatedAtUtc={data.aggregatedAtUtc} testId={TEST_IDS.freshness} />
    </div>
  );
};

/**
 * The author dashboard on `/admin` (P-03, #91), for everyone who writes: views and readers per day,
 * the most viewed articles, how far they are read and the mazhabs their readers chose — only the
 * signed-in user's own (written or co-written) articles, read from `GET /analytics/me`.
 */
export const AuthorAnalyticsSection: React.FC = () => {
  const t = useLocale().authorDashboard;
  const [period, setPeriod] = useState<AnalyticsPeriodQuery>(DEFAULT_PERIOD);
  const query = useQuery({
    queryKey: [AUTHOR_ANALYTICS_QUERY_KEY, periodKey(period)],
    queryFn: () => getAuthorAnalytics(period),
  });

  const body = () => {
    if (query.isError) return <p className="text-sm text-red-700">{t.loadFailed}</p>;
    if (!query.data) return <p className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>;
    return <AnalyticsBody data={query.data} />;
  };

  return (
    <section className="space-y-4" data-testid="author-analytics" aria-labelledby="author-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="author-analytics-title" className="text-lg font-semibold text-[var(--color-ink-strong)]">
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
