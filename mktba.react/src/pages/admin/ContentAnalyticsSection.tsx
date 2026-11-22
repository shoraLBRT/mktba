import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { type AnalyticsPeriodQuery, getContentAnalytics } from '../../services/adminService';
import type { ContentAnalyticsDto, ContentArticleDto, UncoveredOpinionBlockDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { CsvButton, FilterInput, Freshness, PeriodPicker, StatCard } from './analyticsParts';
import type { CsvCell } from './analyticsCsv';
import { matchesFilter } from './analyticsFormat';
import { DEFAULT_PERIOD, articleStatsHref, periodKey } from './analyticsPeriod';

type DateColumn = 'publishedAt' | 'updatedAt';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const CONTENT_ANALYTICS_QUERY_KEY = 'contentAnalytics';

const TEST_IDS = {
  withoutViews: 'content-analytics-without-views',
  stubs: 'content-analytics-stubs',
  uncovered: 'content-analytics-uncovered',
  stale: 'content-analytics-stale',
  freshness: 'content-analytics-freshness',
  filter: 'content-analytics-filter',
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
const ArticleCell: React.FC<{ articleId: number; title: string; slug: string; period: { from: string; to: string } }> = ({
  articleId,
  title,
  slug,
  period,
}) => {
  const locale = useLocale();
  const t = locale.contentAnalytics;
  const smallLink = 'text-xs text-[var(--color-ink-muted)] hover:underline';
  return (
    <td className="py-2 pr-3 [overflow-wrap:anywhere]">
      <Link to={`/${slug}`} className={linkClass}>{title}</Link>
      {' · '}
      <Link to={articleStatsHref(articleId, period)} className={smallLink}>{locale.analyticsTools.statsLink}</Link>
      {' · '}
      <Link to={`/admin/articles/${articleId}/edit`} className={smallLink}>{t.edit}</Link>
    </td>
  );
};

/** «Shown 50 of 73» under a list cut short; nothing while the list is filtered (N-08). */
const ShownOf: React.FC<{ shown: number; total: number; filtered: boolean }> = ({ shown, total, filtered }) => {
  const t = useLocale().contentAnalytics;
  if (total <= shown || filtered) return null;
  return <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{formatMessage(t.shownOf, { shown, total })}</p>;
};

type ArticleTableProps = {
  list: { total: number; items: ContentArticleDto[] };
  period: { from: string; to: string };
  /** The list is narrowed by the filter: `list.items` are what is left. */
  filtered: boolean;
  /** The date column, if any. */
  date?: DateColumn;
  showReaders?: boolean;
  emptyText: string;
  testId: string;
};

const ArticleTable: React.FC<ArticleTableProps> = ({ list, period, filtered, date, showReaders = false, emptyText, testId }) => {
  const locale = useLocale();
  const t = locale.contentAnalytics;
  if (list.items.length === 0) {
    return <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{filtered ? locale.analyticsTools.filterNothing : emptyText}</p>;
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
              <ArticleCell articleId={article.articleId} title={article.title} slug={article.slug} period={period} />
              {date ? <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">{formatDate(article[date])}</td> : null}
              <td className="py-2 pl-2 text-right tabular-nums">{article.views}</td>
              {showReaders ? <td className="py-2 pl-2 text-right tabular-nums">{article.readers}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <ShownOf shown={list.items.length} total={list.total} filtered={filtered} />
    </>
  );
};

type BlockTableProps = {
  list: { total: number; items: UncoveredOpinionBlockDto[] };
  period: { from: string; to: string };
  filtered: boolean;
};

const BlockTable: React.FC<BlockTableProps> = ({ list, period, filtered }) => {
  const locale = useLocale();
  const t = locale.contentAnalytics;
  if (list.items.length === 0) {
    return <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{filtered ? locale.analyticsTools.filterNothing : t.noUncovered}</p>;
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
              <ArticleCell articleId={block.articleId} title={block.title} slug={block.slug} period={period} />
              <td className="py-2 pr-3">{formatMessage(t.blockLabel, { position: block.position, opinions: block.opinions })}</td>
              <td className="py-2 pr-3">{block.missingSchools.join(', ')}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{block.missingSchoolViews}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{block.articleViews}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ShownOf shown={list.items.length} total={list.total} filtered={filtered} />
    </>
  );
};

type ListCardProps = { title: string; description: string; csv: React.ReactNode; children: React.ReactNode };

const ListCard: React.FC<ListCardProps> = ({ title, description, csv, children }) => (
  <Card className="overflow-x-auto p-6">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{title}</h3>
      {csv}
    </div>
    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
    {children}
  </Card>
);

type ArticleList = { total: number; items: ContentArticleDto[] };

const AnalyticsBody: React.FC<{ data: ContentAnalyticsDto }> = ({ data }) => {
  const locale = useLocale();
  const t = locale.contentAnalytics;
  const tools = locale.analyticsTools;
  const staleDays = { days: data.staleAfterDays };
  const [filter, setFilter] = useState('');
  const filtered = filter.trim() !== '';
  const narrow = (list: ArticleList): ArticleList => ({
    total: list.total,
    items: list.items.filter((article) => matchesFilter(filter, article.title, article.slug)),
  });
  const stubs = narrow(data.stubsWithTraffic);
  const withoutViews = narrow(data.articlesWithoutViews);
  const stale = narrow(data.staleArticles);
  const blocks = {
    total: data.uncoveredBlocks.total,
    items: data.uncoveredBlocks.items.filter((block) => matchesFilter(filter, block.title, block.slug)),
  };
  const articleRows = (list: ArticleList): CsvCell[][] => [
    [tools.articleIdColumn, tools.titleColumn, tools.slugColumn, t.publishedColumn, t.updatedColumn, t.viewsColumn, t.readersColumn],
    ...list.items.map((a) => [a.articleId, a.title, a.slug, a.publishedAt, a.updatedAt, a.views, a.readers]),
  ];
  const csv = (title: string, name: string, rows: () => CsvCell[][]) => <CsvButton table={title} name={name} period={data} rows={rows} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testId={TEST_IDS.withoutViewsTotal} label={t.withoutViews} value={data.articlesWithoutViews.total} hint={t.withoutViewsHint} />
        <StatCard testId={TEST_IDS.stubsTotal} label={t.stubs} value={data.stubsWithTraffic.total} hint={t.stubsHint} />
        <StatCard testId={TEST_IDS.uncoveredTotal} label={t.uncovered} value={data.uncoveredBlocks.total} hint={t.uncoveredHint} />
        <StatCard testId={TEST_IDS.staleTotal} label={t.stale} value={data.staleArticles.total} hint={formatMessage(t.staleHint, staleDays)} />
      </div>

      <FilterInput value={filter} onChange={setFilter} testId={TEST_IDS.filter} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={t.stubsTitle} description={t.stubsDescription} csv={csv(t.stubsTitle, 'content-stubs', () => articleRows(stubs))}>
          <ArticleTable
            list={stubs}
            period={data}
            filtered={filtered}
            showReaders
            emptyText={t.noStubs}
            testId={TEST_IDS.stubs}
          />
        </ListCard>
        <ListCard
          title={t.withoutViewsTitle}
          description={t.withoutViewsDescription}
          csv={csv(t.withoutViewsTitle, 'content-without-views', () => articleRows(withoutViews))}
        >
          <ArticleTable
            list={withoutViews}
            period={data}
            filtered={filtered}
            date={PUBLISHED}
            emptyText={t.noWithoutViews}
            testId={TEST_IDS.withoutViews}
          />
        </ListCard>
      </div>

      <ListCard
        title={t.uncoveredTitle}
        description={t.uncoveredDescription}
        csv={csv(t.uncoveredTitle, 'content-uncovered-blocks', () => [
          [tools.articleIdColumn, tools.titleColumn, tools.slugColumn, t.blockColumn, t.missingColumn, t.missingViewsColumn, t.viewsColumn],
          ...blocks.items.map((b) => [b.articleId, b.title, b.slug, b.position, b.missingSchools.join(', '), b.missingSchoolViews, b.articleViews]),
        ])}
      >
        <BlockTable list={blocks} period={data} filtered={filtered} />
      </ListCard>

      <ListCard
        title={t.staleTitle}
        description={formatMessage(t.staleDescription, staleDays)}
        csv={csv(t.staleTitle, 'content-stale', () => articleRows(stale))}
      >
        <ArticleTable list={stale} period={data} filtered={filtered} date={UPDATED} emptyText={t.noStale} testId={TEST_IDS.stale} />
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
  const [period, setPeriod] = useState<AnalyticsPeriodQuery>(DEFAULT_PERIOD);
  const query = useQuery({
    queryKey: [CONTENT_ANALYTICS_QUERY_KEY, periodKey(period)],
    queryFn: () => getContentAnalytics(period),
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
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {body()}
    </section>
  );
};
