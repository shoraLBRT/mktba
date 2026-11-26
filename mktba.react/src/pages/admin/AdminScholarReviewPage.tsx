import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import {
  getScholarApplications,
  scholarApplicationsQueryKey,
  type ScholarApplicationFilter,
} from '../../services/scholarReviewService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { SCHOLAR_APPLICATION_STATUSES, applicantLabel } from '../../shared/scholarApplication';
import type { ScholarApplicationStatus } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

const PAGE_SIZE = 20;

const isStatus = (value: string): value is ScholarApplicationStatus =>
  (SCHOLAR_APPLICATION_STATUSES as readonly string[]).includes(value);

/**
 * `/admin/scholar-applications` (V-02, #118): the scholar applications for review, newest first,
 * filtered by status (the pending ones at first), 20 a page. Admins only, as in the API. A line opens
 * the application with its documents and decisions.
 */
const AdminScholarReviewPage = () => {
  const locale = useLocale();
  const t = locale.scholarReview;
  const statusLabels = locale.scholarApplication.status;
  const format = useFormat();
  const [filter, setFilter] = useState<ScholarApplicationFilter>({ status: 'Pending', page: 1, pageSize: PAGE_SIZE });
  const listQuery = useQuery({
    queryKey: scholarApplicationsQueryKey(filter),
    queryFn: () => getScholarApplications(filter),
    placeholderData: keepPreviousData,
  });
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const page = listQuery.data?.page ?? filter.page;
  const pageSize = listQuery.data?.pageSize ?? filter.pageSize;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="scholar-review-status" className="text-sm text-[var(--color-ink-muted)]">{t.filterLabel}</label>
        <select
          id="scholar-review-status"
          value={filter.status ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            setFilter({ ...filter, status: isStatus(value) ? value : undefined, page: 1 });
          }}
          className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
        >
          <option value="">{t.allStatuses}</option>
          {SCHOLAR_APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
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
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.submittedAt}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.applicant}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.degree}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.documents}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.status}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} data-testid={`scholar-review-row-${item.id}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        to={`/admin/scholar-applications/${item.id}`}
                        aria-label={formatMessage(t.open, { id: item.id })}
                        className="text-[var(--color-brand-forest)] hover:underline"
                      >
                        {format.date(item.submittedAt, 'dateTime')}
                      </Link>
                    </td>
                    <td className="px-3 py-2 break-words">{applicantLabel(item.applicant)}</td>
                    <td className="px-3 py-2 break-words">{`${item.degree} · ${item.specialization}`}</td>
                    <td className="px-3 py-2">{item.documentCount}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{statusLabels[item.status]}</td>
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

export default AdminScholarReviewPage;
