import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { articlesForReviewQueryKey, getArticlesForReview, type ArticleReviewFilter } from '../../services/articleReviewService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { isScholarMazhab } from '../../shared/scholarApplication';
import type { ArticleReviewArticlePageDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { CABINET_PAGE_SIZE, ListPager, RemarkHistoryList, ReviewHistoryList } from './ScholarHistoryLists';

const PATH = '/admin/article-reviews';
const TABS = ['queue', 'all', 'reviews', 'remarks'] as const;

type CabinetTab = (typeof TABS)[number];

const tabFrom = (value: string | null): CabinetTab => (TABS as readonly string[]).includes(value ?? '') ? value as CabinetTab : 'queue';

const tabHref = (tab: CabinetTab) => (tab === 'queue' ? PATH : `${PATH}?tab=${tab}`);

/**
 * `/admin/article-reviews` — the scholar's cabinet (V-07, #123; first V-03 #119). Four tabs in `?tab=`:
 * «Очередь» (default) — the articles needing a re-review (V-05, #121), then those the scholar has not
 * reviewed, matching their specialization and madhab first; «Все статьи» — the same order with the
 * reviewed ones at the end; «Мои отметки» and «Мои замечания» — the scholar's history across articles.
 * A line opens the article's review page, which stays as it was.
 */
const AdminArticleReviewsPage = () => {
  const t = useLocale().articleReview;
  const [searchParams] = useSearchParams();
  const tab = tabFrom(searchParams.get('tab'));
  const tabClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active
      ? 'border-[var(--color-brand-forest)] bg-[var(--color-surface-muted)] font-medium text-[var(--color-ink-strong)]'
      : 'border-[var(--color-border-soft)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.listTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.listDescription}</p>
      </div>
      <nav aria-label={t.tabsLabel} className="flex flex-wrap gap-2">
        {TABS.map((option) => (
          <Link key={option} to={tabHref(option)} aria-current={option === tab ? 'page' : undefined} className={tabClass(option === tab)}>
            {t.tabs[option]}
          </Link>
        ))}
      </nav>
      {tab === 'reviews' ? <ReviewHistoryList /> : tab === 'remarks' ? <RemarkHistoryList /> : <ArticleQueue key={tab} queueOnly={tab === 'queue'} />}
    </div>
  );
};

/** What the queue's order is based on: the specialization's words and the madhab, said plainly. */
const MatchBasis = ({ data }: { data: ArticleReviewArticlePageDto }) => {
  const locale = useLocale();
  const t = locale.articleReview;
  const mazhab = data.mazhab;
  return (
    <div data-testid="article-review-match-basis" className="space-y-1 text-sm text-[var(--color-ink-muted)]">
      <p className="m-0">
        {data.specializationKeywords.length > 0
          ? formatMessage(t.matchKeywords, { keywords: data.specializationKeywords.join(', ') })
          : t.matchNoKeywords}
        {isScholarMazhab(mazhab) ? ` ${formatMessage(t.matchMazhab, { mazhab: locale.scholarApplication.mazhabs[mazhab] })}` : null}
      </p>
      <p className="m-0 text-[12px]">{t.matchHint}</p>
    </div>
  );
};

const Badge = ({ children }: { children: string }) => (
  <span className="me-1 mt-1 inline-block rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[12px] text-[var(--color-ink-strong)]">
    {children}
  </span>
);

/** The queue (`queueOnly`) or all published articles, in the queue's order, with a title search and a pager. */
const ArticleQueue = ({ queueOnly }: { queueOnly: boolean }) => {
  const locale = useLocale();
  const t = locale.articleReview;
  const format = useFormat();
  const [filter, setFilter] = useState<ArticleReviewFilter>({ query: '', queueOnly, page: 1, pageSize: CABINET_PAGE_SIZE });
  const listQuery = useQuery({
    queryKey: articlesForReviewQueryKey(filter),
    queryFn: () => getArticlesForReview(filter),
    placeholderData: keepPreviousData,
  });
  const items = listQuery.data?.items ?? [];
  const reReviewTotal = listQuery.data?.needsReReviewTotal ?? 0;

  return (
    <>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">{queueOnly ? t.queueDescription : t.allDescription}</p>
      {listQuery.data ? <MatchBasis data={listQuery.data} /> : null}
      {reReviewTotal > 0 ? (
        <p data-testid="article-review-rereview-count" className="m-0 text-sm font-medium text-[var(--color-ink-strong)]">
          {formatMessage(t.reReviewCount, { count: reReviewTotal })}
        </p>
      ) : null}
      <div className="max-w-md">
        <label htmlFor="article-review-search" className="mb-1 block text-sm text-[var(--color-ink-muted)]">{t.searchLabel}</label>
        <Input
          id="article-review-search"
          type="search"
          value={filter.query}
          onChange={(event) => setFilter({ ...filter, query: event.target.value, page: 1 })}
        />
      </div>
      <Card className="overflow-hidden p-0">
        {listQuery.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : listQuery.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">
            {`${t.loadError}: ${extractApiErrorMessage(listQuery.error)}`}
          </p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">
            {queueOnly && filter.query.trim() === '' ? t.queueEmpty : t.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.tableLabel} className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.title}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.revision}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.updatedAt}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.myReview}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.articleId} data-testid={`article-review-row-${item.articleId}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className="px-3 py-2 break-words">
                      <Link
                        to={`/admin/article-reviews/${item.articleId}`}
                        aria-label={formatMessage(t.open, { title: item.title })}
                        className="text-[var(--color-brand-forest)] hover:underline"
                      >
                        {item.title}
                      </Link>
                      {item.matchesSpecialization || item.matchesMazhab ? (
                        <div>
                          {item.matchesSpecialization ? <Badge>{t.badgeSpecialization}</Badge> : null}
                          {item.matchesMazhab ? <Badge>{t.badgeMazhab}</Badge> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{item.latestRevisionNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{format.date(item.updatedAt, 'dateTime')}</td>
                    <td className="px-3 py-2">
                      {item.myLatestReview
                        ? formatMessage(t.myReviewOf, { verdict: t.verdicts[item.myLatestReview.verdict], number: item.myLatestReview.revisionNumber })
                        : t.notReviewed}
                      {item.myLatestReview && !item.myLatestReview.isCurrent ? (
                        <span className="ms-1 font-medium text-[var(--color-ink-strong)]">{`— ${t.reReviewNeeded}`}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          page={listQuery.data?.page ?? filter.page}
          pageSize={listQuery.data?.pageSize ?? filter.pageSize}
          total={listQuery.data?.total ?? 0}
          onPage={(page) => setFilter({ ...filter, page })}
        />
      </Card>
    </>
  );
};

export default AdminArticleReviewsPage;
