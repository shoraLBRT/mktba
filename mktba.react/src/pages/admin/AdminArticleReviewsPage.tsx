import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { articlesForReviewQueryKey, getArticlesForReview, type ArticleReviewFilter } from '../../services/articleReviewService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

const PAGE_SIZE = 20;

/**
 * `/admin/article-reviews` (V-03, #119): the published articles a scholar may review, with the
 * caller's latest mark on each; a title search and 20 a page. A line opens the article's review.
 * First come the articles whose mark a substantial edit made stale, with their count above the
 * table (V-05, #121: the re-review request of D5, until notifications in V-09 #125), then the latest
 * edited. The scholar's cabinet with a queue by specialization is V-07 (#123).
 */
const AdminArticleReviewsPage = () => {
  const locale = useLocale();
  const t = locale.articleReview;
  const format = useFormat();
  const [filter, setFilter] = useState<ArticleReviewFilter>({ query: '', page: 1, pageSize: PAGE_SIZE });
  const listQuery = useQuery({
    queryKey: articlesForReviewQueryKey(filter),
    queryFn: () => getArticlesForReview(filter),
    placeholderData: keepPreviousData,
  });
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const reReviewTotal = listQuery.data?.needsReReviewTotal ?? 0;
  const page = listQuery.data?.page ?? filter.page;
  const pageSize = listQuery.data?.pageSize ?? filter.pageSize;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.listTitle}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.listDescription}</p>
        {reReviewTotal > 0 ? (
          <p data-testid="article-review-rereview-count" className="mt-2 text-sm font-medium text-[var(--color-ink-strong)]">
            {formatMessage(t.reReviewCount, { count: reReviewTotal })}
          </p>
        ) : null}
      </div>
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
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
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
        <nav
          aria-label={t.paginationLabel}
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-soft)] px-3 py-2 text-sm"
        >
          <span className="text-[var(--color-ink-muted)]">{formatMessage(t.pageInfo, { from, to, total })}</span>
          <div className="flex items-center gap-2">
            <Button className="px-3 py-1" disabled={page <= 1} onClick={() => setFilter({ ...filter, page: page - 1 })}>
              {t.previousPage}
            </Button>
            <Button className="px-3 py-1" disabled={to >= total} onClick={() => setFilter({ ...filter, page: page + 1 })}>
              {t.nextPage}
            </Button>
          </div>
        </nav>
      </Card>
    </div>
  );
};

export default AdminArticleReviewsPage;
