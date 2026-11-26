import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import {
  articleRemarksQueryKey,
  closeArticleRemark,
  reopenArticleRemark,
  replyToArticleRemark,
} from '../../services/articleRemarkService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { ARTICLE_REMARK_MESSAGE_MAX_LENGTH, isOpenRemark, remarkAnchorParts, remarkElementId } from '../../shared/articleRemarks';
import { cn } from '../../shared/lib/cn';
import type { ArticleRemarkDto, ArticleRemarkListDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Textarea } from '../../shared/ui/Textarea';

type Action = { kind: 'reply' } | { kind: 'close'; outcome: 'Resolved' | 'Closed' } | { kind: 'reopen' };

type RemarkThreadProps = {
  remark: ArticleRemarkDto;
  /** Scrolls the editor to the remark's block; absent where there is no editor. */
  onJump?: (paragraphId: number) => void;
};

/**
 * One scholar's remark on a block with its thread (V-06, #122): where it points (the paragraph, or
 * «блок удалён»), the excerpt it was made on, the messages, and what the caller may do — reply,
 * close as fixed or without a change, reopen — as the API's flags allow. Shared by the editor's
 * panel and the scholar's review page.
 */
export const RemarkThread = ({ remark, onJump }: RemarkThreadProps) => {
  const t = useLocale().articleRemarks;
  const format = useFormat();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const messageId = useId();
  const hintId = useId();

  const mutation = useMutation({
    mutationFn: (action: Action) => {
      const text = message.trim();
      if (action.kind === 'reply') return replyToArticleRemark(remark.id, text);
      if (action.kind === 'close') return closeArticleRemark(remark.id, action.outcome, text || null);
      return reopenArticleRemark(remark.id, text || null);
    },
    onSuccess: (updated) => {
      setMessage('');
      queryClient.setQueryData<ArticleRemarkListDto>(articleRemarksQueryKey(remark.articleId), (current) =>
        current ? { ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) } : current,
      );
    },
  });

  const anchor = remarkAnchorParts(remark);
  const where = [
    formatMessage(remark.onOpinion ? t.anchorOpinion : t.anchorParagraph, { number: anchor.order }),
    anchor.removed ? t.blockRemoved : null,
    anchor.movedTo !== null ? formatMessage(t.anchorMoved, { number: anchor.movedTo }) : null,
  ].filter(Boolean).join(' · ');
  const hasText = message.trim().length > 0;
  const paragraphId = remark.paragraphId;
  const jump = onJump && paragraphId !== null && paragraphId !== undefined && !remark.blockRemoved
    ? <Button variant="ghost" className="px-3 py-1.5" onClick={() => onJump(paragraphId)}>{t.jump}</Button>
    : null;

  return (
    <article
      id={remarkElementId(remark.id)}
      tabIndex={-1}
      aria-label={`${where}: ${t.status[remark.status]}`}
      className="space-y-2 rounded-xl border border-[var(--color-border-soft)] p-3 text-sm focus:outline-none focus:ring-4 focus:ring-[var(--color-focus-ring)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-medium text-[var(--color-ink-strong)]">{where}</p>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            isOpenRemark(remark) ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {t.status[remark.status]}
        </span>
      </div>
      <p className="m-0 text-xs text-[var(--color-ink-muted)]">
        {formatMessage(t.meta, { number: remark.revisionNumber, date: format.date(remark.createdAt, 'dateTime') })}
        {remark.scholarName && !remark.isMine ? ` · ${formatMessage(t.byScholar, { name: remark.scholarName })}` : null}
      </p>
      {remark.excerpt ? (
        <blockquote className="m-0 border-s-2 border-[var(--color-border-soft)] ps-3 text-[var(--color-ink-muted)] break-words">
          {remark.excerpt}
        </blockquote>
      ) : null}
      <ol aria-label={t.threadLabel} className="m-0 list-none space-y-2 p-0">
        {remark.messages.map((item) => (
          <li key={item.id} className="space-y-0.5">
            <p className="m-0 text-xs font-medium text-[var(--color-ink-default)]">
              {`${item.isMine ? t.you : item.authorName ?? t.participants[item.participant]} · ${format.date(item.createdAt, 'dateTime')}`}
            </p>
            <p className="m-0 whitespace-pre-wrap break-words text-[var(--color-ink-default)]">{item.body}</p>
          </li>
        ))}
      </ol>
      {remark.canReply || remark.canClose || remark.canReopen ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (remark.canReply && hasText) mutation.mutate({ kind: 'reply' });
          }}
        >
          <label htmlFor={messageId} className="block text-xs font-medium text-[var(--color-ink-default)]">{t.messageLabel}</label>
          <Textarea
            id={messageId}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={ARTICLE_REMARK_MESSAGE_MAX_LENGTH}
            rows={2}
            aria-describedby={hintId}
          />
          <p id={hintId} className="m-0 text-xs text-[var(--color-ink-subtle)]">{t.messageHint}</p>
          {mutation.isError ? (
            <p role="alert" className="m-0 text-xs text-red-600">{`${t.actionError}: ${extractApiErrorMessage(mutation.error)}`}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {remark.canReply ? (
              <Button type="submit" variant="primary" className="px-3 py-1.5" disabled={mutation.isPending || !hasText}>
                {mutation.isPending ? t.sending : t.reply}
              </Button>
            ) : null}
            {remark.canClose ? (
              <>
                <Button className="px-3 py-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate({ kind: 'close', outcome: 'Resolved' })}>
                  {t.resolve}
                </Button>
                <Button className="px-3 py-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate({ kind: 'close', outcome: 'Closed' })}>
                  {t.close}
                </Button>
              </>
            ) : null}
            {remark.canReopen ? (
              <Button className="px-3 py-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate({ kind: 'reopen' })}>
                {t.reopen}
              </Button>
            ) : null}
            {jump}
          </div>
        </form>
      ) : jump}
    </article>
  );
};

type RemarkListProps = {
  remarks: readonly ArticleRemarkDto[];
  onJump?: (paragraphId: number) => void;
};

/** The open remarks, then a toggle for the closed ones. */
export const RemarkList = ({ remarks, onJump }: RemarkListProps) => {
  const t = useLocale().articleRemarks;
  const [showClosed, setShowClosed] = useState(false);
  if (remarks.length === 0) {
    return <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>;
  }

  const open = remarks.filter(isOpenRemark);
  const closed = remarks.filter((remark) => !isOpenRemark(remark));
  return (
    <div className="space-y-3">
      <p className="m-0 text-sm text-[var(--color-ink-default)]">{formatMessage(t.openCount, { count: open.length })}</p>
      {open.map((remark) => <RemarkThread key={remark.id} remark={remark} onJump={onJump} />)}
      {closed.length > 0 ? (
        <Button variant="ghost" className="px-3 py-1.5" aria-expanded={showClosed} onClick={() => setShowClosed((current) => !current)}>
          {showClosed ? t.hideClosed : formatMessage(t.showClosed, { count: closed.length })}
        </Button>
      ) : null}
      {showClosed ? closed.map((remark) => <RemarkThread key={remark.id} remark={remark} onJump={onJump} />) : null}
    </div>
  );
};
