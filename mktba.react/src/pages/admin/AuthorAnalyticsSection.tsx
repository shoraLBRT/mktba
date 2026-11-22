import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
// Admin-only strings stay out of the eagerly loaded dictionaries, so out of the article page's first load.
import t from '../../localization/locales/ru/admin/authorDashboard.json';
import common from '../../localization/locales/ru/admin/siteAnalytics.json';
import { getAuthorAnalytics } from '../../services/adminService';
import type { AuthorAnalyticsDto, ReadDepthDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
import { Freshness, PeriodSwitch, SchoolShares, StatCard } from './analyticsParts';
import { SECONDARY_COLOR, VIEWS_COLOR, dailyGeometry, formatDay, share } from './analyticsFormat';

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
};

const DEPTHS: { key: keyof Omit<ReadDepthDto, 'views'>; label: string }[] = [
  { key: 'reachedDepth25', label: t.depth25 },
  { key: 'reachedDepth50', label: t.depth50 },
  { key: 'reachedDepth75', label: t.depth75 },
  { key: 'reachedDepth100', label: t.depth100 },
];

const DepthBars: React.FC<{ depth: ReadDepthDto }> = ({ depth }) => (
  <ul className="space-y-2" data-testid="author-analytics-depth">
    {DEPTHS.map(({ key, label }) => (
      <li key={key}>
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-[var(--color-ink-default)]">{label}</span>
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

const AnalyticsBody: React.FC<{ data: AuthorAnalyticsDto }> = ({ data }) => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard testId={TEST_IDS.views} label={t.views} value={data.totals.views} />
      <StatCard testId={TEST_IDS.readers} label={t.readers} value={data.totals.readers} hint={t.readersHint} />
      <StatCard testId={TEST_IDS.articles} label={t.articlesViewed} value={data.totals.articlesViewed} />
      <StatCard
        testId={TEST_IDS.finished}
        label={t.finished}
        value={share(data.depth.reachedDepth100, data.depth.views)}
        hint={t.finishedHint}
      />
    </div>

    <Card className="p-6">
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.dailyTitle}</h3>
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
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.topArticlesTitle}</h3>
      {data.topArticles.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
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
              {data.topArticles.map((article) => (
                <tr key={article.articleId} className="border-t border-[var(--color-border-soft)]">
                  <td className="py-2 pr-3">
                    <Link to={`/${article.slug}`} className="text-[var(--color-brand-forest)] hover:underline">
                      {article.title}
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

/**
 * The author dashboard on `/admin` (P-03, #91), for everyone who writes: views and readers per day,
 * the most viewed articles, how far they are read and the mazhabs their readers chose — only the
 * signed-in user's own (written or co-written) articles, read from `GET /analytics/me`.
 */
export const AuthorAnalyticsSection: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: [AUTHOR_ANALYTICS_QUERY_KEY, days],
    queryFn: () => getAuthorAnalytics(days),
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
        <PeriodSwitch days={days} onChange={setDays} />
      </div>
      {body()}
    </section>
  );
};
