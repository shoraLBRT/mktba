import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateArticleQueries } from '../app/queryClient';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { formatMessage } from '../localization';
import { useLocale } from '../localization/hooks';
import {
  compareArticleRevisions,
  getArticleRevisions,
  restoreArticleRevision,
} from '../services/Article/revisionService';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';
import type { ArticleRevisionSummaryDto } from '../shared/types/ApiTypes';
import { compareSnapshots } from './article-history/revisionDiff';
import { RevisionDiffSections } from './article-history/RevisionDiffView';
import { revisionDateTime, useSnapshotLabels } from './article-history/snapshotLabels';

/**
 * An article's revision history on a page of its own: every save, a comparison of two revisions and
 * rollback. The editor's «История» dialog (E-13, #83) does the same next to the draft.
 */
const ArticleHistoryPage = () => {
  const { articleId } = useParams();
  const numericId = Number(articleId);
  const t = useLocale().articleHistoryPage;
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<{ from?: number; to?: number }>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const revisionsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, numericId],
    queryFn: () => getArticleRevisions(numericId),
  });
  const systemSchoolsQuery = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS], queryFn: getSystemSchools });
  const articleSchoolsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, numericId],
    queryFn: () => getSchoolsByArticleId(numericId),
  });

  const revisions = useMemo(() => revisionsQuery.data ?? [], [revisionsQuery.data]);
  const to = selection.to ?? revisions[0]?.number;
  const from = selection.from ?? revisions[1]?.number;

  const comparisonQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, numericId, 'compare', from, to],
    queryFn: () => compareArticleRevisions(numericId, from!, to!),
    enabled: from !== undefined && to !== undefined && from !== to,
  });

  const schoolName = useMemo(() => {
    const names = new Map<number, string>();
    [...(systemSchoolsQuery.data ?? []), ...(articleSchoolsQuery.data ?? [])].forEach((school) => names.set(school.id, school.name));
    return (id: number) => names.get(id) ?? `#${id}`;
  }, [systemSchoolsQuery.data, articleSchoolsQuery.data]);

  const labels = useSnapshotLabels();

  const sections = useMemo(
    () => (comparisonQuery.data ? compareSnapshots(comparisonQuery.data.from.snapshot, comparisonQuery.data.to.snapshot, labels, schoolName) : []),
    [comparisonQuery.data, labels, schoolName],
  );

  const restoreMutation = useMutation({
    mutationFn: ({ number, comment }: { number: number; comment: string }) => restoreArticleRevision(numericId, number, comment),
    onSuccess: async (created, { number }) => {
      setSelection({});
      setNotice({ tone: 'success', message: formatMessage(t.restored, { from: number, to: created.number }) });
      await Promise.all([
        invalidateArticleQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, numericId] }),
      ]);
    },
    onError: (error) => setNotice({ tone: 'error', message: `${t.restoreError}: ${(error as Error).message}` }),
  });

  if (revisionsQuery.isError) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8">
        <Card className="px-6 py-5"><p className="text-sm text-red-600">{t.loadError}</p></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em] text-[var(--color-ink-strong)]">{t.title}</h1>
        <Link to={`/admin/articles/${numericId}/edit`} className="text-sm text-[var(--color-brand-forest)] hover:underline">
          {t.backToEditor}
        </Link>
      </div>

      {notice ? (
        <p role="status" className={`m-0 rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice.message}
        </p>
      ) : null}

      {revisionsQuery.isSuccess && revisions.length === 0 ? <p className="text-sm text-[var(--color-ink-muted)]">{t.empty}</p> : null}

      <ol className="m-0 list-none space-y-3 p-0" aria-label={t.title}>
        {revisions.map((revision) => (
          <RevisionRow
            key={revision.id}
            revision={revision}
            isFrom={revision.number === from}
            isTo={revision.number === to}
            isLatest={revision.number === revisions[0]?.number}
            restoring={restoreMutation.isPending}
            onPickFrom={() => setSelection({ from: revision.number, to })}
            onPickTo={() => setSelection({ from, to: revision.number })}
            onRestore={(comment) => restoreMutation.mutate({ number: revision.number, comment })}
          />
        ))}
      </ol>

      {revisions.length > 1 ? (
        <Card className="space-y-4 px-6 py-5">
          {from !== undefined && to !== undefined && from !== to ? (
            <>
              <h2 className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">{formatMessage(t.compareTitle, { from, to })}</h2>
              {comparisonQuery.isSuccess ? <RevisionDiffSections sections={sections} /> : null}
            </>
          ) : (
            <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.compareHint}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
};

type RevisionRowProps = {
  revision: ArticleRevisionSummaryDto;
  isFrom: boolean;
  isTo: boolean;
  isLatest: boolean;
  restoring: boolean;
  onPickFrom: () => void;
  onPickTo: () => void;
  onRestore: (comment: string) => void;
};

const RevisionRow = ({ revision, isFrom, isTo, isLatest, restoring, onPickFrom, onPickTo, onRestore }: RevisionRowProps) => {
  const t = useLocale().articleHistoryPage;
  const [confirming, setConfirming] = useState(false);
  const [comment, setComment] = useState('');
  const title = formatMessage(t.revisionNumber, { number: revision.number });

  return (
    <li>
      <Card className="space-y-3 px-5 py-4" aria-label={title}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">
              {title}
              {revision.isPublished ? (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{t.publishedBadge}</span>
              ) : null}
            </p>
            <p className="m-0 text-xs text-[var(--color-ink-subtle)]">
              {revisionDateTime.format(new Date(revision.createdAt))} · {revision.authorEmail ?? t.unknownAuthor}
            </p>
            <p className="m-0 text-sm text-[var(--color-ink-default)]">{revision.comment ?? t.noComment}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="radio" name="compare-from" checked={isFrom} onChange={onPickFrom} />
              {t.compareFrom}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="compare-to" checked={isTo} onChange={onPickTo} />
              {t.compareTo}
            </label>
          </div>
        </div>
        {isLatest ? null : confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t.restoreCommentPlaceholder}
              maxLength={500}
              className="max-w-sm"
            />
            <Button variant="primary" disabled={restoring} onClick={() => { onRestore(comment); setConfirming(false); }}>
              {t.restoreConfirm}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>{t.restoreCancel}</Button>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)}>{t.restoreButton}</Button>
        )}
      </Card>
    </li>
  );
};

export default ArticleHistoryPage;
