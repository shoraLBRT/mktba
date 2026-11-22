import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getSearchAnalytics } from '../../services/adminService';
import { searchHref } from '../../shared/search';
import type { SearchAnalyticsDto, SearchQueryTotalDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { Freshness, PeriodSwitch, StatCard } from './analyticsParts';
import { share } from './analyticsFormat';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const SEARCH_ANALYTICS_QUERY_KEY = 'searchAnalytics';

const TEST_IDS = {
  searches: 'search-analytics-searches',
  withoutResults: 'search-analytics-without-results',
  topQueries: 'search-analytics-top-queries',
  queriesWithoutResults: 'search-analytics-queries-without-results',
  freshness: 'search-analytics-freshness',
};

type QueryTableProps = {
  queries: SearchQueryTotalDto[];
  emptyText: string;
  testId: string;
};

/** Queries with their counts; each opens the results page as a reader sees it now. */
const QueryTable: React.FC<QueryTableProps> = ({ queries, emptyText, testId }) => {
  const t = useLocale().searchAnalytics;
  if (queries.length === 0) {
    return <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{emptyText}</p>;
  }

  return (
    <table className="mt-3 w-full text-sm" data-testid={testId}>
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
          <th scope="col" className="pb-2 font-semibold">{t.queryColumn}</th>
          <th scope="col" className="pb-2 text-right font-semibold">{t.searchesColumn}</th>
          <th scope="col" className="pb-2 text-right font-semibold">{t.searchersColumn}</th>
          <th scope="col" className="pb-2 text-right font-semibold">{t.withoutResultsColumn}</th>
        </tr>
      </thead>
      <tbody>
        {queries.map((query) => (
          <tr key={query.query} className="border-t border-[var(--color-border-soft)]">
            <td className="py-2 pr-3 [overflow-wrap:anywhere]">
              <Link to={searchHref(query.query)} className="text-[var(--color-brand-forest)] hover:underline">
                {query.query}
              </Link>
            </td>
            <td className="py-2 text-right tabular-nums">{query.searches}</td>
            <td className="py-2 text-right tabular-nums">{query.searchers}</td>
            <td className="py-2 text-right tabular-nums">{query.searchesWithoutResults}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const AnalyticsBody: React.FC<{ data: SearchAnalyticsDto }> = ({ data }) => {
  const t = useLocale().searchAnalytics;
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-[var(--color-ink-muted)]" data-testid="search-analytics-privacy">
        {formatMessage(t.privacyNote, { minSearchers: data.minSearchers })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard testId={TEST_IDS.searches} label={t.searches} value={data.totals.searches} />
        <StatCard
          testId={TEST_IDS.withoutResults}
          label={t.searchesWithoutResults}
          value={data.totals.searchesWithoutResults}
          hint={formatMessage(t.searchesWithoutResultsHint, {
            share: share(data.totals.searchesWithoutResults, data.totals.searches),
          })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.withoutResultsTitle}</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.withoutResultsDescription}</p>
          <QueryTable
            queries={data.queriesWithoutResults}
            emptyText={t.noQueriesWithoutResults}
            testId={TEST_IDS.queriesWithoutResults}
          />
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.topQueriesTitle}</h3>
          <QueryTable queries={data.topQueries} emptyText={t.noQueries} testId={TEST_IDS.topQueries} />
        </Card>
      </div>

      <Card className="p-6" data-testid="search-analytics-external">
        <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.externalTitle}</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.externalDescription}</p>
      </Card>

      <Freshness aggregatedAtUtc={data.aggregatedAtUtc} testId={TEST_IDS.freshness} />
    </div>
  );
};

/**
 * The search analytics on `/admin` (N-06, #100), for admins only: how often the site's own search
 * was used, the popular queries and the queries that found nothing, over a chosen period, read
 * from the daily summaries (`GET /analytics/search`). Only queries several visitors made on a day
 * are listed; phrases from external search engines are Yandex Metrika's (D7).
 */
export const SearchAnalyticsSection: React.FC = () => {
  const locale = useLocale();
  const t = locale.searchAnalytics;
  const common = locale.siteAnalytics;
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: [SEARCH_ANALYTICS_QUERY_KEY, days],
    queryFn: () => getSearchAnalytics(days),
  });

  const body = () => {
    if (query.isError) return <p className="text-sm text-red-700">{common.loadFailed}</p>;
    if (!query.data) return <p className="text-sm text-[var(--color-ink-muted)]">{common.loading}</p>;
    return <AnalyticsBody data={query.data} />;
  };

  return (
    <section className="space-y-4" data-testid="search-analytics" aria-labelledby="search-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="search-analytics-title" className="text-lg font-semibold text-[var(--color-ink-strong)]">
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
