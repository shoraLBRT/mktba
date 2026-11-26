import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { getMyRemarks, myRemarksQueryKey } from '../../services/articleRemarkService';
import { getMyReviewHistory, myReviewHistoryQueryKey } from '../../services/articleReviewService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { ScholarReviewHistoryItemDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

export const CABINET_PAGE_SIZE = 20;

const tdClass = 'px-3 py-2';
const thClass = 'px-3 py-2 text-start font-medium';

/** «1–20 из 45» with the previous and next buttons, under a list of the scholar's cabinet. */
export const ListPager = ({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) => {
  const t = useLocale().articleReview;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label={t.paginationLabel}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-soft)] px-3 py-2 text-sm"
    >
      <span className="text-[var(--color-ink-muted)]">{formatMessage(t.pageInfo, { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <Button className="px-3 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t.previousPage}</Button>
        <Button className="px-3 py-1" disabled={to >= total} onClick={() => onPage(page + 1)}>{t.nextPage}</Button>
      </div>
    </nav>
  );
};

/** The title of an article in a history list: a link to its review page while it is published. */
const ArticleCell = ({ articleId, title, isAvailable }: { articleId: number; title: string; isAvailable: boolean }) => {
  const t = useLocale().articleReview;
  return isAvailable ? (
    <Link
      to={`/admin/article-reviews/${articleId}`}
      aria-label={formatMessage(t.open, { title })}
      className="text-[var(--color-brand-forest)] hover:underline"
    >
      {title}
    </Link>
  ) : (
    <>
      <span>{title}</span>
      <span className="block text-[12px] text-[var(--color-ink-muted)]">{t.unavailable}</span>
    </>
  );
};

const reviewState = (item: ScholarReviewHistoryItemDto, t: ReturnType<typeof useLocale>['articleReview']) =>
  item.isLatestRevision ? t.historyLatest : item.isCurrent ? t.historyEarlier : t.historyStale;

/** «Мои отметки» (V-07, #123): every verdict the scholar gave, the latest first, with whether it is still current. */
export const ReviewHistoryList = () => {
  const locale = useLocale();
  const t = locale.articleReview;
  const format = useFormat();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: myReviewHistoryQueryKey(page),
    queryFn: () => getMyReviewHistory(page, CABINET_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  const items = query.data?.items ?? [];

  return (
    <>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.reviewsDescription}</p>
      <Card className="overflow-hidden p-0">
        {query.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : query.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">{`${t.loadError}: ${extractApiErrorMessage(query.error)}`}</p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.reviewsEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.reviewsTableLabel} className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className={thClass}>{t.reviewColumns.title}</th>
                  <th scope="col" className={thClass}>{t.reviewColumns.revision}</th>
                  <th scope="col" className={thClass}>{t.reviewColumns.verdict}</th>
                  <th scope="col" className={thClass}>{t.reviewColumns.date}</th>
                  <th scope="col" className={thClass}>{t.reviewColumns.state}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.reviewId} data-testid={`my-review-row-${item.reviewId}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className={`${tdClass} break-words`}>
                      <ArticleCell articleId={item.articleId} title={item.title} isAvailable={item.isAvailable} />
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {formatMessage(t.revisionOf, { number: item.revisionNumber, latest: item.latestRevisionNumber })}
                    </td>
                    <td className={tdClass}>{t.verdicts[item.verdict]}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{format.date(item.updatedAt, 'dateTime')}</td>
                    <td className={tdClass}>
                      <span className={item.isCurrent ? undefined : 'font-medium text-[var(--color-ink-strong)]'}>{reviewState(item, t)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager page={query.data?.page ?? page} pageSize={query.data?.pageSize ?? CABINET_PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
      </Card>
    </>
  );
};

const REMARK_FILTERS = [
  { id: 'open', open: true },
  { id: 'closed', open: false },
  { id: 'all', open: null },
] as const;

type RemarkFilter = (typeof REMARK_FILTERS)[number]['id'];

/** «Мои замечания» (V-07, #123): the scholar's remarks across articles, open ones by default, the latest changed first. */
export const RemarkHistoryList = () => {
  const locale = useLocale();
  const t = locale.articleReview;
  const remarksText = locale.articleRemarks;
  const format = useFormat();
  const [filter, setFilter] = useState<RemarkFilter>('open');
  const [page, setPage] = useState(1);
  const open = REMARK_FILTERS.find((option) => option.id === filter)!.open;
  const query = useQuery({
    queryKey: myRemarksQueryKey(open, page),
    queryFn: () => getMyRemarks(open, page, CABINET_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  const items = query.data?.items ?? [];
  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active
      ? 'border-[var(--color-brand-forest)] bg-[var(--color-surface-muted)] font-medium text-[var(--color-ink-strong)]'
      : 'border-[var(--color-border-soft)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'}`;

  return (
    <>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.remarksDescription}</p>
      <div role="group" aria-label={t.remarksFilterLabel} className="flex flex-wrap items-center gap-2">
        {REMARK_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === filter}
            className={chipClass(option.id === filter)}
            onClick={() => {
              setFilter(option.id);
              setPage(1);
            }}
          >
            {t.remarkFilters[option.id]}
          </button>
        ))}
        {query.data ? (
          <span data-testid="my-remarks-open-count" className="text-sm text-[var(--color-ink-muted)]">
            {formatMessage(t.remarksOpenCount, { count: query.data.openTotal })}
          </span>
        ) : null}
      </div>
      <Card className="overflow-hidden p-0">
        {query.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : query.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">{`${remarksText.loadError}: ${extractApiErrorMessage(query.error)}`}</p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.remarksEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.remarksTableLabel} className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className={thClass}>{t.remarkColumns.title}</th>
                  <th scope="col" className={thClass}>{t.remarkColumns.block}</th>
                  <th scope="col" className={thClass}>{t.remarkColumns.status}</th>
                  <th scope="col" className={thClass}>{t.remarkColumns.date}</th>
                  <th scope="col" className={thClass}>{t.remarkColumns.messages}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.remarkId} data-testid={`my-remark-row-${item.remarkId}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className={`${tdClass} break-words`}>
                      <ArticleCell articleId={item.articleId} title={item.articleTitle} isAvailable={item.isAvailable} />
                    </td>
                    <td className={`${tdClass} break-words`}>
                      {formatMessage(item.onOpinion ? t.remarkBlockOpinion : t.remarkBlock, { number: item.revisionNumber, excerpt: item.excerpt })}
                    </td>
                    <td className={tdClass}>{remarksText.status[item.status]}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>{format.date(item.updatedAt, 'dateTime')}</td>
                    <td className={tdClass}>{item.messageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager page={query.data?.page ?? page} pageSize={query.data?.pageSize ?? CABINET_PAGE_SIZE} total={query.data?.total ?? 0} onPage={setPage} />
      </Card>
    </>
  );
};
