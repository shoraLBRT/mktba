import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { DEFAULT_LANGUAGE } from '../../localization/language';
import { articleReviewQueryKey, getArticleReviewContext, submitArticleReview } from '../../services/articleReviewService';
import { getSchoolsByArticleId, getSystemSchools } from '../../services/schoolService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import {
  ARTICLE_REVIEW_COMMENT_MAX_LENGTH,
  ARTICLE_REVIEW_VERDICTS,
  canSubmitReview,
  reviewNeedsComment,
  scopeSnapshot,
} from '../../shared/articleReview';
import { SCHOLAR_MAZHABS, type ScholarMazhab } from '../../shared/scholarApplication';
import { localizedArticleHref } from '../../shared/slug';
import type { ArticleReviewContextDto, ArticleReviewVerdict } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Textarea } from '../../shared/ui/Textarea';
import { snapshotSections } from '../article-history/revisionDiff';
import { useSnapshotLabels } from '../article-history/snapshotLabels';

const isMazhab = (value: string | null | undefined): value is ScholarMazhab =>
  (SCHOLAR_MAZHABS as readonly string[]).includes(value ?? '');

/**
 * `/admin/article-reviews/:articleId` (V-03, #119): a scholar reads the latest revision of a
 * published article — only what readers of their madhab see when their approved application names
 * one — and gives a verdict tied to that revision, with a comment; below, their earlier marks of the
 * article. An admin sees the page without the form. Remarks on a paragraph are V-06 (#122).
 */
const AdminArticleReviewPage = () => {
  const { articleId } = useParams();
  const numericId = Number(articleId);
  const locale = useLocale();
  const t = locale.articleReview;
  const format = useFormat();
  const contextQuery = useQuery({
    queryKey: articleReviewQueryKey(numericId),
    queryFn: () => getArticleReviewContext(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });

  const backLink = (
    <Link to="/admin/article-reviews" className="text-sm text-[var(--color-brand-forest)] hover:underline">{t.backToList}</Link>
  );

  if (contextQuery.isPending) {
    return <p className="m-0 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>;
  }

  if (contextQuery.isError) {
    return (
      <div className="space-y-4">
        <p role="alert" className="m-0 text-sm text-red-600">{`${t.articleLoadError}: ${extractApiErrorMessage(contextQuery.error)}`}</p>
        {backLink}
      </div>
    );
  }

  const context = contextQuery.data;
  const mazhab = context.scope.mazhab;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{context.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          {backLink}
          <Link to={localizedArticleHref(context.locale, context.slug)} className="text-[var(--color-brand-forest)] hover:underline">
            {t.openOnSite}
          </Link>
        </div>
      </div>
      <p className="m-0 text-sm text-[var(--color-ink-muted)]">
        {formatMessage(t.revisionCaption, { number: context.revision.number, date: format.date(context.revision.createdAt, 'longDateTime') })}
      </p>
      <p className="m-0 text-sm text-[var(--color-ink-default)]">
        {isMazhab(mazhab) ? formatMessage(t.scopeMazhab, { mazhab: locale.scholarApplication.mazhabs[mazhab] }) : t.scopeWhole}
      </p>
      <RevisionCard context={context} />
      {context.canReview ? (
        <ReviewFormCard context={context} />
      ) : (
        <p role="note" className="m-0 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t.notVerified}</p>
      )}
      <HistoryCard context={context} />
    </div>
  );
};

const RevisionCard = ({ context }: { context: ArticleReviewContextDto }) => {
  const t = useLocale().articleReview;
  const labels = useSnapshotLabels();
  const systemSchoolsQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, DEFAULT_LANGUAGE], queryFn: () => getSystemSchools() });
  const articleSchoolsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, context.articleId],
    queryFn: () => getSchoolsByArticleId(context.articleId),
  });
  const sections = useMemo(() => {
    const names = new Map<number, string>();
    [...(systemSchoolsQuery.data ?? []), ...(articleSchoolsQuery.data ?? [])].forEach((school) => names.set(school.id, school.name));
    const schoolName = (id: number) => names.get(id) ?? `#${id}`;
    return snapshotSections(scopeSnapshot(context.revision.snapshot, context.scope.schoolId), labels, schoolName)
      .filter((section) => section.key !== 'slug' && section.text.trim().length > 0);
  }, [context, labels, systemSchoolsQuery.data, articleSchoolsQuery.data]);

  return (
    <Card className="space-y-4 px-6 py-5">
      <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{t.revisionTitle}</h2>
      {sections.map((section) => (
        <section key={section.key} aria-label={section.label}>
          <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink-default)]">{section.label}</h3>
          <p className="m-0 whitespace-pre-wrap rounded-xl border border-[var(--color-border-soft)] p-3 text-sm leading-6 break-words">{section.text}</p>
        </section>
      ))}
    </Card>
  );
};

const ReviewFormCard = ({ context }: { context: ArticleReviewContextDto }) => {
  const t = useLocale().articleReview;
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState<ArticleReviewVerdict | null>(null);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const commentId = useId();
  const hintId = useId();
  const reviewedBefore = context.myReviews.some((review) => review.revisionNumber === context.revision.number);

  const mutation = useMutation({
    mutationFn: (chosen: ArticleReviewVerdict) =>
      submitArticleReview(context.articleId, { revisionNumber: context.revision.number, verdict: chosen, comment: comment.trim() || null }),
    onSuccess: async (review) => {
      setSaved(review.revisionNumber);
      setVerdict(null);
      setComment('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: articleReviewQueryKey(context.articleId) }),
        queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVIEWS] }),
      ]);
    },
  });

  return (
    <Card className="space-y-3 px-6 py-5">
      <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{t.formTitle}</h2>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmitReview(verdict, comment)) mutation.mutate(verdict);
        }}
      >
        <fieldset className="m-0 space-y-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-[var(--color-ink-default)]">{t.verdictLegend}</legend>
          {ARTICLE_REVIEW_VERDICTS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-[var(--color-ink-default)]">
              <input
                type="radio"
                name="verdict"
                value={option}
                checked={verdict === option}
                onChange={() => {
                  setVerdict(option);
                  setSaved(null);
                }}
                className="accent-[var(--color-brand-forest)]"
              />
              {t.verdicts[option]}
            </label>
          ))}
        </fieldset>
        <label htmlFor={commentId} className="block text-sm font-medium text-[var(--color-ink-default)]">{t.commentLabel}</label>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={ARTICLE_REVIEW_COMMENT_MAX_LENGTH}
          rows={5}
          aria-describedby={hintId}
          required={verdict !== null && reviewNeedsComment(verdict)}
        />
        <p id={hintId} className="m-0 text-xs text-[var(--color-ink-subtle)]">
          {verdict === 'Confirmed' ? t.commentOptionalHint : t.commentRequiredHint}
        </p>
        {reviewedBefore ? <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.replaceNote}</p> : null}
        {mutation.isError ? (
          <p role="alert" className="m-0 text-sm text-red-600">{`${t.submitError}: ${extractApiErrorMessage(mutation.error)}`}</p>
        ) : null}
        {saved !== null ? (
          <p role="status" className="m-0 text-sm text-emerald-800">{formatMessage(t.submitted, { number: saved })}</p>
        ) : null}
        <Button type="submit" variant="primary" disabled={mutation.isPending || !canSubmitReview(verdict, comment)}>
          {mutation.isPending ? t.submitting : t.submit}
        </Button>
      </form>
    </Card>
  );
};

const HistoryCard = ({ context }: { context: ArticleReviewContextDto }) => {
  const t = useLocale().articleReview;
  const format = useFormat();
  return (
    <Card className="space-y-3 px-6 py-5">
      <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{t.historyTitle}</h2>
      {context.myReviews.length === 0 ? (
        <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.historyEmpty}</p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {context.myReviews.map((review) => (
            <li key={review.id} data-testid={`my-review-${review.revisionNumber}`} className="space-y-1 text-sm">
              <p className="m-0 font-medium text-[var(--color-ink-strong)]">
                {`${t.verdicts[review.verdict]} · ${review.isLatestRevision ? t.historyLatest : t.historyEarlier}`}
              </p>
              <p className="m-0 text-[var(--color-ink-muted)]">
                {formatMessage(t.historyItem, { number: review.revisionNumber, date: format.date(review.updatedAt, 'dateTime') })}
              </p>
              {review.comment ? <p className="m-0 whitespace-pre-wrap break-words text-[var(--color-ink-default)]">{review.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default AdminArticleReviewPage;
