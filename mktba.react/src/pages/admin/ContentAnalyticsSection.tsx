import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getContentAnalytics } from '../../services/adminService';
import type { ContentAnalyticsDto, ContentArticleDto, UncoveredOpinionBlockDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { Freshness, PeriodSwitch, StatCard } from './analyticsParts';

type DateColumn = 'publishedAt' | 'updatedAt';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const CONTENT_ANALYTICS_QUERY_KEY = 'contentAnalytics';

const TEST_IDS = {
  withoutViews: 'content-analytics-without-views',
  stubs: 'content-analytics-stubs',
  uncovered: 'content-analytics-uncovered',
  stale: 'content-analytics-stale',
  freshness: 'content-analytics-freshness',
  withoutViewsTotal: 'content-analytics-without-views-total',
  stubsTotal: 'content-analytics-stubs-total',
  uncoveredTotal: 'content-analytics-uncovered-total',
  staleTotal: 'content-analytics-stale-total',
};

/** Which date an article list shows. */
const PUBLISHED: DateColumn = 'publishedAt';
const UPDATED: DateColumn = 'updatedAt';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });
const formatDate = (value?: string | null) => (value ? dateFormat.format(new Date(value)) : '—');

const headClass = 'text-left text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]';
const linkClass = 'text-[var(--color-brand-forest)] hover:underline';

/** The article's title linking to it as readers see it, and a link to its editor. */
const ArticleCell: React.FC<{ articleId: number; title: string; slug: string }> = ({ articleId, title, slug }) => {
  const t = useLocale().contentAnalytics;
  return (
    <td className="py-2 pr-3 [overflow-wrap:anywhere]">
      <Link to={`/${slug}`} className={linkClass}>{title}</Link>
      {' · '}
      <Link to={`/admin/articles/${articleId}/edit`} className="text-xs text-[var(--color-ink-muted)] hover:underline">{t.edit}</Link>
    </td>
  );
};

/** «Shown 50 of 73» under a list cut short. */
const ShownOf: React.FC<{ shown: number; total: number }> = ({ shown, total }) => {
  const t = useLocale().contentAnalytics;
  if (total <= shown) return null;
  return <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{formatMessage(t.shownOf, { shown, total })}</p>;
};

type ArticleTableProps = {
  list: { total: number; items: ContentArticleDto[] };
  /** The date column, if any. */
  date?: DateColumn;
  showReaders?: boolean;
  emptyText: string;
  testId: string;
};

const ArticleTable: React.FC<ArticleTableProps> = ({ list, date, showReaders = false, emptyText, testId }) => {
  const t = useLocale().contentAnalytics;
  if (list.items.length === 0) {
    return <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{emptyText}</p>;
  }

  return (
    <>
      <table className="mt-3 w-full text-sm" data-testid={testId}>
        <thead>
          <tr className={headClass}>
            <th scope="col" className="pb-2 font-semibold">{t.articleColumn}</th>
            {date ? (
              <th scope="col" className="pb-2 text-right font-semibold">
                {date === 'publishedAt' ? t.publishedColumn : t.updatedColumn}
              </th>
            ) : null}
            <th scope="col" className="pb-2 text-right font-semibold">{t.viewsColumn}</th>
            {showReaders ? <th scope="col" className="pb-2 text-right font-semibold">{t.readersColumn}</th> : null}
          </tr>
        </thead>
        <tbody>
          {list.items.map((article) => (
            <tr key={article.articleId} className="border-t border-[var(--color-border-soft)]">
              <ArticleCell articleId={article.articleId} title={article.title} slug={article.slug} />
              {date ? <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">{formatDate(article[date])}</td> : null}
              <td className="py-2 pl-2 text-right tabular-nums">{article.views}</td>
              {showReaders ? <td className="py-2 pl-2 text-right tabular-nums">{article.readers}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <ShownOf shown={list.items.length} total={list.total} />
    </>
  );
};

const BlockTable: React.FC<{ list: { total: number; items: UncoveredOpinionBlockDto[] } }> = ({ list }) => {
  const t = useLocale().contentAnalytics;
  if (list.items.length === 0) {
    return <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.noUncovered}</p>;
  }

  return (
    <>
      <table className="mt-3 w-full text-sm" data-testid={TEST_IDS.uncovered}>
        <thead>
          <tr className={headClass}>
            <th scope="col" className="pb-2 font-semibold">{t.articleColumn}</th>
            <th scope="col" className="pb-2 font-semibold">{t.blockColumn}</th>
            <th scope="col" className="pb-2 font-semibold">{t.missingColumn}</th>
            <th scope="col" className="pb-2 text-right font-semibold">{t.missingViewsColumn}</th>
            <th scope="col" className="pb-2 text-right font-semibold">{t.viewsColumn}</th>
          </tr>
        </thead>
        <tbody>
          {list.items.map((block) => (
            <tr key={block.paragraphId} className="border-t border-[var(--color-border-soft)]">
              <ArticleCell articleId={block.articleId} title={block.title} slug={block.slug} />
              <td className="py-2 pr-3">{formatMessage(t.blockLabel, { position: block.position, opinions: block.opinions })}</td>
              <td className="py-2 pr-3">{block.missingSchools.join(', ')}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{block.missingSchoolViews}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{block.articleViews}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShownOf shown={list.items.length} total={list.total} />
    </>
  );
};

const ListCard: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <Card className="overflow-x-auto p-6">
    <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{title}</h3>
    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
    {children}
  </Card>
);

const AnalyticsBody: React.FC<{ data: ContentAnalyticsDto }> = ({ data }) => {
  const t = useLocale().contentAnalytics;
  const staleDays = { days: data.staleAfterDays };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId={TEST_IDS.withoutViewsTotal} label={t.withoutViews} value={data.articlesWithoutViews.total} hint={t.withoutViewsHint} />
        <StatCard testId={TEST_IDS.stubsTotal} label={t.stubs} value={data.stubsWithTraffic.total} hint={t.stubsHint} />
        <StatCard testId={TEST_IDS.uncoveredTotal} label={t.uncovered} value={data.uncoveredBlocks.total} hint={t.uncoveredHint} />
        <StatCard testId={TEST_IDS.staleTotal} label={t.stale} value={data.staleArticles.total} hint={formatMessage(t.staleHint, staleDays)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={t.stubsTitle} description={t.stubsDescription}>
          <ArticleTable list={data.stubsWithTraffic} showReaders emptyText={t.noStubs} testId={TEST_IDS.stubs} />
        </ListCard>
        <ListCard title={t.withoutViewsTitle} description={t.withoutViewsDescription}>
          <ArticleTable list={data.articlesWithoutViews} date={PUBLISHED} emptyText={t.noWithoutViews} testId={TEST_IDS.withoutViews} />
        </ListCard>
      </div>

      <ListCard title={t.uncoveredTitle} description={t.uncoveredDescription}>
        <BlockTable list={data.uncoveredBlocks} />
      </ListCard>

      <ListCard title={t.staleTitle} description={formatMessage(t.staleDescription, staleDays)}>
        <ArticleTable list={data.staleArticles} date={UPDATED} emptyText={t.noStale} testId={TEST_IDS.stale} />
      </ListCard>

      <Freshness aggregatedAtUtc={data.aggregatedAtUtc} testId={TEST_IDS.freshness} />
    </div>
  );
};

/**
 * The content analytics on `/admin` (N-07, #101), for admins only: Published articles nobody opened
 * in the period, stubs readers already reach, blocks of opinions with no opinion for some canonical
 * mazhab, and articles not saved for a long time (`GET /analytics/content`). Views come from the
 * daily summaries; the articles are taken as they are now.
 */
export const ContentAnalyticsSection: React.FC = () => {
  const locale = useLocale();
  const t = locale.contentAnalytics;
  const common = locale.siteAnalytics;
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: [CONTENT_ANALYTICS_QUERY_KEY, days],
    queryFn: () => getContentAnalytics(days),
  });

  const body = () => {
    if (query.isError) return <p className="text-sm text-red-700">{common.loadFailed}</p>;
    if (!query.data) return <p className="text-sm text-[var(--color-ink-muted)]">{common.loading}</p>;
    return <AnalyticsBody data={query.data} />;
  };

  return (
    <section className="space-y-4" data-testid="content-analytics" aria-labelledby="content-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="content-analytics-title" className="text-lg font-semibold text-[var(--color-ink-strong)]">
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
