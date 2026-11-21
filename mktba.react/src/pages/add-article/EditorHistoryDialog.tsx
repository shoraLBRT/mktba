import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getArticleRevision, getArticleRevisions, restoreArticleRevision } from '../../services/Article/revisionService';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';
import type { ArticleRevisionSummaryDto, SchoolDto } from '../../shared/types/ApiTypes';
import { compareSnapshots } from '../article-history/revisionDiff';
import { RevisionDiffSections } from '../article-history/RevisionDiffView';
import { revisionDateTime, useSnapshotLabels } from '../article-history/snapshotLabels';
import { articleDraftSnapshot, type ArticleDraft } from './articleDraft';
import { PreviewDialog } from './PreviewDialog';

const DRAFT = 'draft';
/** What the «Стало» side shows: the draft in the editor, or a saved revision by number. */
type CompareTarget = typeof DRAFT | number;

type EditorHistoryDialogProps = {
  articleId: number;
  draft: ArticleDraft;
  hasUnsavedChanges: boolean;
  schools: SchoolDto[];
  /** Runs once the server has written the restored revision; the editor reloads the article then. */
  onRestored: (from: number, created: ArticleRevisionSummaryDto) => Promise<void>;
  onClose: () => void;
};

const selectClass = 'min-h-8 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-xs text-[var(--color-ink-strong)]';

/**
 * The article's history inside the editor (E-13, #83): the revisions, any revision compared with
 * the draft in the editor or with another revision, and rollback. A rollback writes a new revision
 * on the server and replaces the draft; with unsaved edits the confirmation says they will be lost.
 */
export const EditorHistoryDialog = ({ articleId, draft, hasUnsavedChanges, schools, onRestored, onClose }: EditorHistoryDialogProps) => {
  const t = useLocale().articleHistoryPage;
  const labels = useSnapshotLabels();
  const fromId = useId();
  const toId = useId();
  const [picked, setPicked] = useState<{ from?: number; to?: CompareTarget }>({});
  const [error, setError] = useState<string | null>(null);

  const revisionsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, articleId],
    queryFn: () => getArticleRevisions(articleId),
  });
  const revisions = useMemo(() => revisionsQuery.data ?? [], [revisionsQuery.data]);
  // Unsaved edits are compared with the last save; otherwise the draft is the last save, compared with the one before.
  const from = picked.from ?? (hasUnsavedChanges ? revisions[0] : revisions[1] ?? revisions[0])?.number;
  const to: CompareTarget = picked.to ?? DRAFT;

  const fromQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, articleId, 'revision', from],
    queryFn: () => getArticleRevision(articleId, from!),
    enabled: from !== undefined,
  });
  const toQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVISIONS, articleId, 'revision', to],
    queryFn: () => getArticleRevision(articleId, to as number),
    enabled: to !== DRAFT,
  });

  const schoolName = useMemo(() => {
    const names = new Map(schools.map((school) => [school.id, school.name]));
    return (id: number) => names.get(id) ?? `#${id}`;
  }, [schools]);

  const toSnapshot = to === DRAFT ? articleDraftSnapshot(draft) : toQuery.data?.snapshot;
  const sections = fromQuery.data && toSnapshot && from !== to
    ? compareSnapshots(fromQuery.data.snapshot, toSnapshot, labels, schoolName)
    : null;

  const restoreMutation = useMutation({
    mutationFn: async ({ number, comment }: { number: number; comment: string }) => {
      const created = await restoreArticleRevision(articleId, number, comment);
      await onRestored(number, created);
    },
    onError: (failure) => setError(`${t.restoreError}: ${(failure as Error).message}`),
  });

  return (
    <PreviewDialog onClose={onClose}>
      {(titleId, close) => (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border-soft)] bg-white px-4 py-2.5">
            <h2 id={titleId} className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
            {/* Closed first: the unsaved-edits question it may raise must not open under an inert page. */}
            <Link to={`/admin/articles/${articleId}/history`} onClick={close} className="text-xs text-[var(--color-brand-forest)] hover:underline">
              {t.fullPage}
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label={t.close}
              data-dialog-close
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink-strong)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            <div className="shrink-0 border-b border-[var(--color-border-soft)] p-4 lg:w-96 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              {error ? <p role="alert" className="mb-3 mt-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              {revisionsQuery.isError ? <p className="m-0 text-sm text-red-600">{t.loadError}</p> : null}
              {revisionsQuery.isSuccess && revisions.length === 0 ? <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.empty}</p> : null}
              <ol className="m-0 list-none space-y-2 p-0" aria-label={t.title}>
                {revisions.map((revision) => (
                  <HistoryRow
                    key={revision.id}
                    revision={revision}
                    isLatest={revision.number === revisions[0]?.number}
                    hasUnsavedChanges={hasUnsavedChanges}
                    restoring={restoreMutation.isPending}
                    onRestore={(comment) => {
                      setError(null);
                      restoreMutation.mutate({ number: revision.number, comment });
                    }}
                  />
                ))}
              </ol>
            </div>

            {revisions.length > 0 ? (
              <div className="min-w-0 flex-1 space-y-4 p-4 lg:overflow-y-auto">
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--color-ink-muted)]">
                  <label htmlFor={fromId}>{t.compareFrom}</label>
                  <select
                    id={fromId}
                    value={from}
                    onChange={(event) => setPicked({ from: Number(event.target.value), to })}
                    className={selectClass}
                  >
                    {revisions.map((revision) => (
                      <option key={revision.id} value={revision.number}>{formatMessage(t.revisionNumber, { number: revision.number })}</option>
                    ))}
                  </select>
                  <label htmlFor={toId}>{t.compareTo}</label>
                  <select
                    id={toId}
                    value={String(to)}
                    onChange={(event) => setPicked({ from, to: event.target.value === DRAFT ? DRAFT : Number(event.target.value) })}
                    className={selectClass}
                  >
                    <option value={DRAFT}>{t.draft}</option>
                    {revisions.map((revision) => (
                      <option key={revision.id} value={revision.number}>{formatMessage(t.revisionNumber, { number: revision.number })}</option>
                    ))}
                  </select>
                </div>
                {from === to ? <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.compareHint}</p> : null}
                {sections ? <RevisionDiffSections sections={sections} /> : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </PreviewDialog>
  );
};

type HistoryRowProps = {
  revision: ArticleRevisionSummaryDto;
  isLatest: boolean;
  hasUnsavedChanges: boolean;
  restoring: boolean;
  onRestore: (comment: string) => void;
};

const HistoryRow = ({ revision, isLatest, hasUnsavedChanges, restoring, onRestore }: HistoryRowProps) => {
  const t = useLocale().articleHistoryPage;
  const [confirming, setConfirming] = useState(false);
  const [comment, setComment] = useState('');
  const title = formatMessage(t.revisionNumber, { number: revision.number });
  return (
    <li aria-label={title} className="space-y-2 rounded-2xl border border-[var(--color-border-soft)] bg-white px-4 py-3">
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
      {isLatest ? null : confirming ? (
        <div className="space-y-2">
          {hasUnsavedChanges ? <p className="m-0 text-xs font-medium text-amber-800">{t.unsavedWarning}</p> : null}
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t.restoreCommentPlaceholder}
            aria-label={t.restoreCommentPlaceholder}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button variant="primary" disabled={restoring} onClick={() => onRestore(comment)}>{t.restoreConfirm}</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>{t.restoreCancel}</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)}>{t.restoreButton}</Button>
      )}
    </li>
  );
};
