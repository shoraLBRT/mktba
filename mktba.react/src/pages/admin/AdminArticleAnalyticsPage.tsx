import React, { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getArticleAnalytics } from '../../services/adminService';
import type { ArticleAnalyticsDto } from '../../shared/types/ApiTypes';
import { articleHref } from '../../shared/slug';
import { Card } from '../../shared/ui/Card';
import { BarChart } from './BarChart';
import { DepthBars } from './AuthorAnalyticsSection';
import { Freshness, PeriodSwitch, SchoolShares, StatCard } from './analyticsParts';
import { SECONDARY_COLOR, VIEWS_COLOR, dailyGeometry, formatDay, share } from './analyticsFormat';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const ARTICLE_ANALYTICS_QUERY_KEY = 'articleAnalytics';

const linkClass = 'text-sm text-[var(--color-brand-forest)] hover:underline';

const AnalyticsBody: React.FC<{ data: ArticleAnalyticsDto }> = ({ data }) => {
  const locale = useLocale();
  const t = locale.articleAnalytics;
  const common = locale.siteAnalytics;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard testId="article-analytics-views" label={t.views} value={data.totals.views} />
        <StatCard testId="article-analytics-readers" label={t.readers} value={data.totals.readers} hint={t.readersHint} />
        <StatCard
          testId="article-analytics-finished"
          label={t.finished}
          value={share(data.depth.reachedDepth100, data.depth.views)}
          hint={t.finishedHint}
        />
        <StatCard
          testId="article-analytics-switches"
          label={t.opinionSwitches}
          value={data.totals.opinionSwitches}
          hint={formatMessage(t.opinionSwitchesHint, { shown: data.totals.opinionsShown })}
        />
        <StatCard testId="article-analytics-clicks" label={t.linkClicks} value={data.totals.internalLinkClicks} hint={t.linkClicksHint} />
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
            title: formatMessage(t.daySummary, {
              date: formatDay(day.day),
              views: day.views,
              readers: day.readers,
              switches: day.opinionSwitches,
              clicks: day.internalLinkClicks,
            }),
            values: [day.views, day.readers],
          }))}
          geometry={dailyGeometry(data.daily.length)}
          groupTestId="article-analytics-day"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.depthTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-[var(--color-ink-muted)]">{t.depthDescription}</p>
          <DepthBars depth={data.depth} testId="article-analytics-depth" />
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.schoolsTitle}</h3>
          <p className="mt-1 mb-3 text-sm text-[var(--color-ink-muted)]">{t.schoolsDescription}</p>
          <SchoolShares
            schools={data.schools}
            viewsWithoutSchool={data.viewsWithoutSchool}
            totalViews={data.depth.views}
            emptyText={t.empty}
            testId="article-analytics-schools"
          />
        </Card>
      </div>

      <Freshness aggregatedAtUtc={data.aggregatedAtUtc} testId="article-analytics-freshness" />
    </div>
  );
};

/**
 * One article's statistics (N-09, #103) at `/admin/articles/:articleId/analytics`: views and readers
 * per day, read depth, the readers' mazhabs, opinion switches and internal link clicks, read from
 * `GET /analytics/articles/{id}`. The API lets an admin see any article and an author only their own
 * (written or co-written); anyone else gets 403 / 404, shown as one message.
 */
const AdminArticleAnalyticsPage: React.FC = () => {
  const t = useLocale().articleAnalytics;
  const articleId = Number(useParams().articleId);
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: [ARTICLE_ANALYTICS_QUERY_KEY, articleId, days],
    queryFn: () => getArticleAnalytics(articleId, days),
    enabled: Number.isInteger(articleId) && articleId > 0,
    retry: (count, error) => !(isAxiosError(error) && [403, 404].includes(error.response?.status ?? 0)) && count < 2,
  });

  const unavailable = !(Number.isInteger(articleId) && articleId > 0)
    || (isAxiosError(query.error) && [403, 404].includes(query.error.response?.status ?? 0));

  const body = () => {
    if (unavailable) return <p className="text-sm text-[var(--color-ink-muted)]" data-testid="article-analytics-unavailable">{t.notFound}</p>;
    if (query.isError) return <p className="text-sm text-red-700">{t.loadFailed}</p>;
    if (!query.data) return <p className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>;
    return <AnalyticsBody data={query.data} />;
  };

  const data = unavailable ? undefined : query.data;
  return (
    <section className="space-y-4" data-testid="article-analytics" aria-labelledby="article-analytics-title">
      <Link to="/admin/articles" className={linkClass}>{t.backToArticles}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-subtle)]">{t.pageTitle}</p>
          <h1 id="article-analytics-title" className="text-xl font-semibold text-[var(--color-ink-strong)]">
            {data?.title ?? t.pageTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">{t.description}</p>
          {data ? (
            <p className="mt-2 flex flex-wrap gap-3">
              <Link to={articleHref(data.slug)} className={linkClass}>{t.openOnSite}</Link>
              <Link to={`/admin/articles/${data.articleId}/edit`} className={linkClass}>{t.edit}</Link>
            </p>
          ) : null}
        </div>
        {unavailable ? null : <PeriodSwitch days={days} onChange={setDays} />}
      </div>
      {body()}
    </section>
  );
};

export default AdminArticleAnalyticsPage;
