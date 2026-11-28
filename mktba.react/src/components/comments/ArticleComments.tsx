import React, { useId, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useFormat, useLocale } from '../../localization/hooks';
import { formatMessage } from '../../localization';
import {
  articleCommentsQueryKey,
  createArticleComment,
  deleteArticleComment,
  getArticleComments,
  reportArticleComment,
  updateArticleComment,
} from '../../services/commentService';
import { useSession } from '../../services/session';
import { extractApiErrorMessage, toApiError } from '../../shared/api-client/apiError';
import {
  COMMENT_BODY_MAX_LENGTH,
  commentLength,
  commentRows,
  templateParts,
  type CommentRow,
} from '../../shared/articleComments';
import type { ArticleCommentDto, ArticleCommentReportReason, ArticleCommentViewerDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Textarea } from '../../shared/ui/Textarea';
import { CommentMarkdown } from './CommentMarkdown';

type Strings = ReturnType<typeof useLocale>['articleComments'];

const INDENT_REM = 1.25;

/**
 * The comments under an article (C-01, #127), loaded in the browser only — never part of the
 * server HTML, so a comment is not indexed as the article's text (C-06, #132). A chunk of its own:
 * `ArticleCommentsSlot` loads it when the reader scrolls near it or asks for it.
 */
const ArticleComments: React.FC<{ articleId: number }> = ({ articleId }) => {
  const t = useLocale().articleComments;
  const { plural } = useFormat();
  const { email, restoring } = useSession();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: articleCommentsQueryKey(articleId, email),
    queryFn: ({ pageParam }) => getArticleComments(articleId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.threads ? last.page + 1 : undefined),
    // Wait for the session to be restored, so the first answer already knows who is reading.
    enabled: !restoring,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_COMMENTS, articleId] });

  if (query.isPending) {
    return <p role="status" className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>;
  }

  if (query.isError) {
    // Not an article readers are served (an author or an admin previewing a draft): it has no comments.
    if (toApiError(query.error).status === 404) {
      return null;
    }

    return (
      <div role="alert" className="text-sm text-red-600">
        <p className="mb-2">{t.loadError} {extractApiErrorMessage(query.error)}</p>
        <Button onClick={() => query.refetch()}>{t.retry}</Button>
      </div>
    );
  }

  const pages = query.data.pages;
  const first = pages[0];
  const viewer = pages[pages.length - 1].viewer;
  const rows = commentRows(pages.flatMap((page) => page.items), t.noName);

  return (
    <div data-testid="article-comments">
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        {first.total > 0 ? plural(t.count, first.total) : t.empty}
      </p>
      {viewer.canComment ? (
        <CommentForm
          t={t}
          label={t.formLabel}
          submitLabel={t.submit}
          onSubmit={(body, website) => createArticleComment(articleId, { body, parentId: null, website })}
          onDone={refresh}
        />
      ) : (
        <ViewerNote t={t} viewer={viewer} />
      )}
      {rows.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {rows.map((row) => (
            <CommentItem
              key={row.comment.id}
              t={t}
              row={row}
              articleId={articleId}
              canReply={viewer.canComment}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <Button className="mt-6" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? t.loading : t.more}
        </Button>
      ) : null}
    </div>
  );
};

/** Why the reader cannot comment, with the way to fix it. */
const ViewerNote: React.FC<{ t: Strings; viewer: ArticleCommentViewerDto }> = ({ t, viewer }) => {
  const { date } = useFormat();
  const className = 'rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-page-panel)] px-4 py-3 text-sm text-[var(--color-ink-muted)]';
  const linkClass = 'font-semibold text-[var(--color-ink-strong)] underline';
  if (viewer.block === 'EmailNotConfirmed') {
    return <p className={className}>{t.emailNotConfirmed}</p>;
  }

  if (viewer.block === 'Banned') {
    return (
      <p className={className} data-testid="comments-banned">
        {viewer.bannedUntil ? formatMessage(t.banned, { date: date(viewer.bannedUntil, 'dateTime') }) : t.bannedForever}
      </p>
    );
  }

  if (viewer.block === 'DisplayNameRequired') {
    return (
      <p className={className}>
        {t.displayNameRequired}{' '}
        <Link to="/admin/profile" className={linkClass}>{t.openProfile}</Link>
      </p>
    );
  }

  const links: Record<string, React.ReactNode> = {
    signIn: <Link to="/login" className={linkClass}>{t.signIn}</Link>,
    signUp: <Link to="/register" className={linkClass}>{t.signUp}</Link>,
  };
  return (
    <p className={className} data-testid="comments-sign-in">
      {templateParts(t.signInRequired).map((part, index) => (
        <React.Fragment key={index}>{part.placeholder ? links[part.placeholder] ?? part.text : part.text}</React.Fragment>
      ))}
    </p>
  );
};

type CommentFormProps = {
  t: Strings;
  label: string;
  submitLabel: string;
  initialBody?: string;
  onSubmit: (body: string, website: string) => Promise<unknown>;
  onDone: () => void;
  onCancel?: () => void;
};

/** The text of a new comment, a reply or an edit, with the trap for bots (the feedback form's pattern). */
const CommentForm: React.FC<CommentFormProps> = ({ t, label, submitLabel, initialBody = '', onSubmit, onDone, onCancel }) => {
  const id = useId();
  const [body, setBody] = useState(initialBody);
  const websiteRef = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: () => onSubmit(body, websiteRef.current?.value ?? ''),
    onSuccess: () => {
      setBody('');
      onDone();
    },
  });
  const length = commentLength(body);
  const tooLong = length > COMMENT_BODY_MAX_LENGTH;

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (length > 0 && !tooLong) {
          mutation.mutate();
        }
      }}
    >
      <label htmlFor={`${id}-body`} className="block text-sm font-medium text-[var(--color-ink-strong)]">{label}</label>
      <Textarea
        id={`${id}-body`}
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        aria-describedby={`${id}-hint ${id}-length`}
        aria-invalid={tooLong || undefined}
      />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--color-ink-muted)]">
        <span id={`${id}-hint`}>{t.formatHint}</span>
        <span id={`${id}-length`} className={tooLong ? 'text-red-600' : undefined}>
          {formatMessage(t.length, { count: length, max: COMMENT_BODY_MAX_LENGTH })}
        </span>
      </div>
      {/* The trap for bots: people neither see nor reach it, and its value is sent as it is. */}
      <div aria-hidden="true" className="absolute inset-s-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>{t.websiteLabel}</label>
        <input ref={websiteRef} id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(mutation.error)}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={mutation.isPending || length === 0 || tooLong}>
          {mutation.isPending ? t.sending : submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>{t.cancel}</Button> : null}
      </div>
    </form>
  );
};

type CommentItemProps = {
  t: Strings;
  row: CommentRow;
  articleId: number;
  canReply: boolean;
  onChanged: () => void;
};

const CommentItem: React.FC<CommentItemProps> = ({ t, row, articleId, canReply, onChanged }) => {
  const { comment, level, replyTo } = row;
  const { date } = useFormat();
  const [mode, setMode] = useState<'view' | 'reply' | 'edit' | 'confirmDelete' | 'report'>('view');
  const [reported, setReported] = useState(false);
  const removal = useMutation({ mutationFn: () => deleteArticleComment(comment.id), onSuccess: onChanged });

  return (
    <li
      data-testid="comment"
      data-comment-id={comment.id}
      className={level > 0 ? 'border-s-2 border-[var(--color-border-soft)] ps-3' : undefined}
      style={{ marginInlineStart: `${Math.max(level - 1, 0) * INDENT_REM}rem` }}
    >
      {comment.isDeleted ? (
        <p className="text-sm italic text-[var(--color-ink-subtle)]">{t.deleted}</p>
      ) : comment.isHidden ? (
        <p className="text-sm italic text-[var(--color-ink-subtle)]">{t.hidden}</p>
      ) : (
        <>
          <CommentHeader t={t} comment={comment} replyTo={replyTo} date={date(comment.createdAt, 'dateTime')} />
          {comment.isPending ? (
            <p data-testid="comment-pending" className="mb-1 text-xs font-medium text-amber-800">{t.pending}</p>
          ) : null}
          {mode === 'edit' ? (
            <CommentForm
              t={t}
              label={t.editLabel}
              submitLabel={t.save}
              initialBody={comment.body ?? ''}
              onSubmit={(body) => updateArticleComment(comment.id, body)}
              onDone={() => {
                setMode('view');
                onChanged();
              }}
              onCancel={() => setMode('view')}
            />
          ) : (
            <CommentMarkdown body={comment.body ?? ''} />
          )}
          {mode !== 'edit' ? (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {canReply ? (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setMode(mode === 'reply' ? 'view' : 'reply')}>
                  {t.reply}
                </Button>
              ) : null}
              {comment.canEdit ? (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setMode('edit')}>{t.edit}</Button>
              ) : null}
              {comment.canReport && !reported && mode !== 'report' ? (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setMode('report')}>{t.report}</Button>
              ) : null}
              {comment.canDelete && mode !== 'confirmDelete' ? (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setMode('confirmDelete')}>{t.delete}</Button>
              ) : null}
              {mode === 'confirmDelete' ? (
                <span role="group" aria-label={t.confirmDelete} className="flex items-center gap-1 text-xs">
                  <span>{t.confirmDelete}</span>
                  <Button variant="danger" className="px-2 py-1 text-xs" disabled={removal.isPending} onClick={() => removal.mutate()}>
                    {t.confirmDeleteYes}
                  </Button>
                  <Button className="px-2 py-1 text-xs" onClick={() => setMode('view')}>{t.cancel}</Button>
                </span>
              ) : null}
            </div>
          ) : null}
          {removal.isError ? <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(removal.error)}</p> : null}
          {reported ? <p role="status" className="text-xs text-[var(--color-ink-muted)]">{t.reported}</p> : null}
          {mode === 'report' ? (
            <ReportForm
              t={t}
              commentId={comment.id}
              onDone={() => {
                setReported(true);
                setMode('view');
              }}
              onCancel={() => setMode('view')}
            />
          ) : null}
          {mode === 'reply' ? (
            <div className="mt-2">
              <CommentForm
                t={t}
                label={t.replyLabel}
                submitLabel={t.submit}
                onSubmit={(body, website) => createArticleComment(articleId, { body, parentId: comment.id, website })}
                onDone={() => {
                  setMode('view');
                  onChanged();
                }}
                onCancel={() => setMode('view')}
              />
            </div>
          ) : null}
        </>
      )}
    </li>
  );
};

const REPORT_REASONS: readonly ArticleCommentReportReason[] = ['Spam', 'Abuse', 'Offtopic', 'Other'];

/** A report of someone else's comment (C-02, #128): what is wrong, and an optional note. */
const ReportForm: React.FC<{ t: Strings; commentId: number; onDone: () => void; onCancel: () => void }> = ({ t, commentId, onDone, onCancel }) => {
  const id = useId();
  const [reason, setReason] = useState<ArticleCommentReportReason>('Spam');
  const [note, setNote] = useState('');
  const mutation = useMutation({ mutationFn: () => reportArticleComment(commentId, { reason, note: note.trim() || null }), onSuccess: onDone });

  return (
    <form
      aria-label={t.reportLabel}
      className="mt-2 space-y-2 rounded-xl border border-[var(--color-border-soft)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label htmlFor={`${id}-reason`} className="block text-sm font-medium text-[var(--color-ink-strong)]">{t.reportReason}</label>
      <select
        id={`${id}-reason`}
        value={reason}
        onChange={(event) => setReason(event.target.value as ArticleCommentReportReason)}
        className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
      >
        {REPORT_REASONS.map((value) => <option key={value} value={value}>{t.reportReasons[value]}</option>)}
      </select>
      <label htmlFor={`${id}-note`} className="block text-sm text-[var(--color-ink-muted)]">{t.reportNote}</label>
      <Textarea id={`${id}-note`} value={note} rows={2} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      {mutation.isError ? <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(mutation.error)}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="px-3 py-1 text-xs" disabled={mutation.isPending}>{t.reportSubmit}</Button>
        <Button className="px-3 py-1 text-xs" onClick={onCancel}>{t.cancel}</Button>
      </div>
    </form>
  );
};

const CommentHeader: React.FC<{ t: Strings; comment: ArticleCommentDto; replyTo: string | null; date: string }> = ({ t, comment, replyTo, date }) => (
  <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm">
    <span className="font-semibold text-[var(--color-ink-strong)]">{comment.authorName ?? t.noName}</span>
    {replyTo ? <span className="text-[var(--color-ink-muted)]">{formatMessage(t.replyTo, { name: replyTo })}</span> : null}
    <time dateTime={comment.createdAt} className="text-xs text-[var(--color-ink-subtle)]">{date}</time>
    {comment.editedAt ? <span className="text-xs text-[var(--color-ink-subtle)]">{t.edited}</span> : null}
  </p>
);

export default ArticleComments;
