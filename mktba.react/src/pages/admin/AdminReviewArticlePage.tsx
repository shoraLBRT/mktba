import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateArticleQueries } from '../../app/queryClient';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { DEFAULT_LANGUAGE } from '../../localization/language';
import { changeArticleStatus, getReviewQueue } from '../../services/adminService';
import { compareArticleRevisions, getArticleRevision } from '../../services/Article/revisionService';
import { getSchoolsByArticleId, getSystemSchools } from '../../services/schoolService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { ArticleStatus, ReviewQueueItemDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Textarea } from '../../shared/ui/Textarea';
import { compareSnapshots } from '../article-history/revisionDiff';
import { RevisionDiffSections } from '../article-history/RevisionDiffView';
import { useSnapshotLabels } from '../article-history/snapshotLabels';
import { EMPTY_SNAPSHOT, REVIEW_QUEUE_QUERY_KEY, canReturnWith, reviewComparisonOf } from './review/reviewQueue';

/** Longest comment the API keeps with a status move (`StatusChangeCommentMaxLength`). */
const COMMENT_MAX_LENGTH = 2000;

/**
 * One article of the moderation queue (A-04, #87): what approval would give readers compared with
 * what they have now, and the decision — approve (publish) or return to the author with a comment.
 */
const AdminReviewArticlePage = () => {
  const { articleId } = useParams();
  const numericId = Number(articleId);
  const locale = useLocale();
  const t = locale.adminReview;
  const format = useFormat();
  const queryClient = useQueryClient();
  const [decided, setDecided] = useState<{ target: ArticleStatus; title: string } | null>(null);

  const queueQuery = useQuery({ queryKey: REVIEW_QUEUE_QUERY_KEY, queryFn: getReviewQueue, enabled: decided === null });
  const item = queueQuery.data?.find((entry) => entry.id === numericId);

  const mutation = useMutation({
    mutationFn: ({ target, comment }: { target: ArticleStatus; comment: string }) =>
      changeArticleStatus(numericId, target, comment),
    onSuccess: async (article, { target }) => {
      setDecided({ target, title: article.title });
      await invalidateArticleQueries(queryClient);
    },
  });

  const backLink = (
    <Link to="/admin/review" className="text-sm text-[var(--color-brand-forest)] hover:underline">
      {t.backToQueue}
    </Link>
  );

  if (decided) {
    return (
      <div className="space-y-4">
        <p role="status" className="m-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {formatMessage(decided.target === 'Published' ? t.approved : t.returned, { title: decided.title })}
        </p>
        {backLink}
      </div>
    );
  }

  if (queueQuery.isPending) {
    return <p className="m-0 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>;
  }

  if (queueQuery.isError || !item) {
    return (
      <div className="space-y-4">
        <p className="m-0 text-sm text-[var(--color-ink-muted)]" role={queueQuery.isError ? 'alert' : undefined}>
          {queueQuery.isError ? `${t.loadError}: ${extractApiErrorMessage(queueQuery.error)}` : t.notInQueue}
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{item.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          {backLink}
          <Link to={`/admin/articles/${item.id}/edit`} className="text-[var(--color-brand-forest)] hover:underline">{t.openEditor}</Link>
          <Link to={`/admin/articles/${item.id}/history`} className="text-[var(--color-brand-forest)] hover:underline">{t.openHistory}</Link>
        </div>
      </div>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">
        {item.authorDisplayName ? formatMessage(t.byAuthor, { name: item.authorDisplayName }) : t.noAuthor}
        {item.submittedAt ? ` · ${formatMessage(t.submittedAt, { date: format.date(item.submittedAt, 'longDateTime') })}` : null}
      </p>
      <ReviewComparisonCard item={item} />
      <ReviewDecisionCard
        pending={mutation.isPending}
        error={mutation.isError ? `${t.decisionError}: ${extractApiErrorMessage(mutation.error)}` : null}
        onDecide={(target, comment) => mutation.mutate({ target, comment })}
      />
    </div>
  );
};

const ReviewComparisonCard = ({ item }: { item: ReviewQueueItemDto }) => {
  const t = useLocale().adminReview;
  const comparison = reviewComparisonOf(item);
  const labels = useSnapshotLabels();

  const systemSchoolsQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, DEFAULT_LANGUAGE], queryFn: () => getSystemSchools() });
  const articleSchoolsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, item.id],
    queryFn: () => getSchoolsByArticleId(item.id),
  });
  const schoolName = useMemo(() => {
    const names = new Map<number, string>();
    [...(systemSchoolsQuery.data ?? []), ...(articleSchoolsQuery.data ?? [])].forEach((school) => names.set(school.id, school.name));
    return (id: number) => names.get(id) ?? `#${id}`;
  }, [systemSchoolsQuery.data, articleSchoolsQuery.data]);

  const snapshotsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, item.id, 'review', comparison],
    queryFn: async () => {
      if (comparison.kind === 'changes') {
        const result = await compareArticleRevisions(item.id, comparison.from, comparison.to);
        return { from: result.from.snapshot, to: result.to.snapshot };
      }
      const revision = await getArticleRevision(item.id, comparison.kind === 'newArticle' ? comparison.revision : 0);
      return { from: EMPTY_SNAPSHOT, to: revision.snapshot };
    },
    enabled: comparison.kind === 'changes' || comparison.kind === 'newArticle',
  });

  const sections = useMemo(
    () => (snapshotsQuery.data ? compareSnapshots(snapshotsQuery.data.from, snapshotsQuery.data.to, labels, schoolName) : []),
    [snapshotsQuery.data, labels, schoolName],
  );

  const caption =
    comparison.kind === 'changes'
      ? formatMessage(t.compareChanges, { from: comparison.from, to: comparison.to })
      : comparison.kind === 'newArticle'
        ? formatMessage(t.compareNewArticle, { number: comparison.revision })
        : comparison.kind === 'unchanged'
          ? formatMessage(t.compareUnchanged, { number: comparison.revision })
          : t.noRevisions;

  return (
    <Card className="space-y-4 px-6 py-5">
      <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{t.comparisonTitle}</h2>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">{caption}</p>
      {snapshotsQuery.isError ? (
        <p role="alert" className="m-0 text-sm text-red-600">{`${t.comparisonError}: ${extractApiErrorMessage(snapshotsQuery.error)}`}</p>
      ) : null}
      {snapshotsQuery.isSuccess ? <RevisionDiffSections sections={sections} /> : null}
    </Card>
  );
};

type ReviewDecisionCardProps = {
  pending: boolean;
  error: string | null;
  onDecide: (target: ArticleStatus, comment: string) => void;
};

const ReviewDecisionCard = ({ pending, error, onDecide }: ReviewDecisionCardProps) => {
  const t = useLocale().adminReview;
  const [comment, setComment] = useState('');
  const commentId = useId();
  const hintId = useId();

  return (
    <Card className="space-y-3 px-6 py-5">
      <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{t.decisionTitle}</h2>
      <label htmlFor={commentId} className="block text-sm font-medium text-[var(--color-ink-default)]">{t.commentLabel}</label>
      <Textarea
        id={commentId}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={4}
        aria-describedby={hintId}
      />
      <p id={hintId} className="m-0 text-xs text-[var(--color-ink-subtle)]">{t.commentHint}</p>
      {error ? <p role="alert" className="m-0 text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={pending} onClick={() => onDecide('Published', comment)}>{t.approve}</Button>
        <Button disabled={pending || !canReturnWith(comment)} onClick={() => onDecide('Draft', comment)}>{t.returnToAuthor}</Button>
      </div>
    </Card>
  );
};

export default AdminReviewArticlePage;
