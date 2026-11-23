import React, { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { type Locale, formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { type AnalyticsPeriodQuery, getSearchAnalytics } from '../../services/adminService';
import { searchHref } from '../../shared/search';
import type { SearchAnalyticsDto, SearchQueryTotalDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import {
  CardHeading,
  ComparisonNote,
  CsvButton,
  FilterInput,
  Freshness,
  PeriodPicker,
  StatCard,
} from './analyticsParts';
import { matchesFilter, share } from './analyticsFormat';
import { DEFAULT_PERIOD, periodKey } from './analyticsPeriod';

// Kept here rather than in APP_CONSTANTS, which the article page loads too.
const SEARCH_ANALYTICS_QUERY_KEY = 'searchAnalytics';

const TEST_IDS = {
  searches: 'search-analytics-searches',
  withoutResults: 'search-analytics-without-results',
  topQueries: 'search-analytics-top-queries',
  queriesWithoutResults: 'search-analytics-queries-without-results',
  freshness: 'search-analytics-freshness',
  comparison: 'search-analytics-comparison',
  filter: 'search-analytics-filter',
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
        <tr className="text-start text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
          <th scope="col" className="pb-2 font-semibold">{t.queryColumn}</th>
          <th scope="col" className="pb-2 text-end font-semibold">{t.searchesColumn}</th>
          <th scope="col" className="pb-2 text-end font-semibold">{t.searchersColumn}</th>
          <th scope="col" className="pb-2 text-end font-semibold">{t.withoutResultsColumn}</th>
        </tr>
      </thead>
      <tbody>
        {queries.map((query) => (
          <tr key={query.query} className="border-t border-[var(--color-border-soft)]">
            <td className="py-2 pe-3 [overflow-wrap:anywhere]">
              <Link to={searchHref(query.query)} className="text-[var(--color-brand-forest)] hover:underline">
                {query.query}
              </Link>
            </td>
            <td className="py-2 text-end tabular-nums">{query.searches}</td>
            <td className="py-2 text-end tabular-nums">{query.searchers}</td>
            <td className="py-2 text-end tabular-nums">{query.searchesWithoutResults}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** A query table as CSV rows, the header first. */
const queryRows = (t: Locale['searchAnalytics'], queries: SearchQueryTotalDto[]) => [
  [t.queryColumn, t.searchesColumn, t.searchersColumn, t.withoutResultsColumn],
  ...queries.map((query) => [query.query, query.searches, query.searchers, query.searchesWithoutResults]),
];

const AnalyticsBody: React.FC<{ data: SearchAnalyticsDto }> = ({ data }) => {
  const locale = useLocale();
  const t = locale.searchAnalytics;
  const tools = locale.analyticsTools;
  const [filter, setFilter] = useState('');
  const withoutResults = data.queriesWithoutResults.filter((query) => matchesFilter(filter, query.query));
  const top = data.topQueries.filter((query) => matchesFilter(filter, query.query));
  const filtered = filter.trim() !== '';
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-[var(--color-ink-muted)]" data-testid="search-analytics-privacy">
        {formatMessage(t.privacyNote, { minSearchers: data.minSearchers })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard testId={TEST_IDS.searches} label={t.searches} value={data.totals.searches} previous={data.previous.totals.searches} />
        <StatCard
          testId={TEST_IDS.withoutResults}
          label={t.searchesWithoutResults}
          value={data.totals.searchesWithoutResults}
          previous={data.previous.totals.searchesWithoutResults}
          hint={formatMessage(t.searchesWithoutResultsHint, {
            share: share(data.totals.searchesWithoutResults, data.totals.searches),
          })}
        />
      </div>
      <ComparisonNote previous={data.previous} testId={TEST_IDS.comparison} />

      {data.topQueries.length > 0 ? <FilterInput value={filter} onChange={setFilter} testId={TEST_IDS.filter} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <CardHeading title={t.withoutResultsTitle}>
            <CsvButton
              table={t.withoutResultsTitle}
              name="search-without-results"
              period={data}
              rows={() => queryRows(t, withoutResults)}
            />
          </CardHeading>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.withoutResultsDescription}</p>
          <QueryTable
            queries={withoutResults}
            emptyText={filtered && data.queriesWithoutResults.length > 0 ? tools.filterNothing : t.noQueriesWithoutResults}
            testId={TEST_IDS.queriesWithoutResults}
          />
        </Card>

        <Card className="p-6">
          <CardHeading title={t.topQueriesTitle}>
            <CsvButton table={t.topQueriesTitle} name="search-top-queries" period={data} rows={() => queryRows(t, top)} />
          </CardHeading>
          <QueryTable
            queries={top}
            emptyText={filtered && data.topQueries.length > 0 ? tools.filterNothing : t.noQueries}
            testId={TEST_IDS.topQueries}
          />
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
  const [period, setPeriod] = useState<AnalyticsPeriodQuery>(DEFAULT_PERIOD);
  const query = useQuery({
    queryKey: [SEARCH_ANALYTICS_QUERY_KEY, periodKey(period)],
    queryFn: () => getSearchAnalytics(period),
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
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {body()}
    </section>
  );
};
