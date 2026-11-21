import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { REVIEW_QUEUE_QUERY_KEY } from './review/reviewQueue';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getReviewQueue } from '../../services/adminService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { ReviewQueueItemDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';
import { revisionDateTime } from '../article-history/snapshotLabels';

/** The moderation queue (A-04, #87): the articles waiting for review, submitted longest ago first. */
const AdminReviewQueuePage = () => {
  const locale = useLocale();
  const t = locale.adminReview;
  const queueQuery = useQuery({ queryKey: REVIEW_QUEUE_QUERY_KEY, queryFn: getReviewQueue });
  const items = queueQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <Card className="p-6">
        {queueQuery.isPending && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>}
        {queueQuery.isError && (
          <p className="m-0 text-sm text-red-600" role="alert">
            {t.loadError}: {extractApiErrorMessage(queueQuery.error)}
          </p>
        )}
        {queueQuery.isSuccess && items.length === 0 && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>}
        {items.length > 0 && (
          <ul className="m-0 list-none divide-y divide-[var(--color-border-soft)] p-0" aria-label={t.title}>
            {items.map((item) => (
              <ReviewQueueRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

const ReviewQueueRow = ({ item }: { item: ReviewQueueItemDto }) => {
  const t = useLocale().adminReview;
  const submitted = item.submittedAt
    ? formatMessage(t.submittedAt, { date: revisionDateTime.format(new Date(item.submittedAt)) })
    : formatMessage(t.updatedAt, { date: revisionDateTime.format(new Date(item.updatedAt)) });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4" data-testid={`review-item-${item.id}`}>
      <div className="min-w-0 space-y-1">
        <p className="m-0 font-medium text-[var(--color-ink-strong)]">{item.title}</p>
        <p className="m-0 text-xs text-[var(--color-ink-subtle)]">
          {item.authorDisplayName ? formatMessage(t.byAuthor, { name: item.authorDisplayName }) : t.noAuthor} · {submitted}
        </p>
        <p className="m-0 text-xs text-[var(--color-ink-muted)]">
          {item.publishedRevisionNumber == null
            ? t.newArticle
            : formatMessage(t.republished, { number: item.publishedRevisionNumber })}
        </p>
      </div>
      <Link
        to={`/admin/review/${item.id}`}
        className="rounded-full border border-[var(--color-border-soft)] px-4 py-1.5 text-sm text-[var(--color-brand-forest)] hover:bg-[var(--color-surface-muted)]"
      >
        {t.open}
      </Link>
    </li>
  );
};

export default AdminReviewQueuePage;
