import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import {
  banCommenter,
  commentBansQueryKey,
  commentModerationQueryKey,
  getCommentBans,
  getCommentModerationQueue,
  moderateComment,
  unbanCommenter,
} from '../../services/commentModerationService';
import { deleteArticleComment } from '../../services/commentService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { CommentModerationAction, CommentModerationItemDto, CommentModerationQueue } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Textarea } from '../../shared/ui/Textarea';

type Strings = ReturnType<typeof useLocale>['commentModeration'];

const QUEUES: readonly CommentModerationQueue[] = ['Pending', 'Reported', 'Hidden'];

const COUNT_KEYS = { Pending: 'pending', Reported: 'reported', Hidden: 'hidden' } as const satisfies Record<CommentModerationQueue, string>;

/** The ban lengths offered, in days; `forever` is a ban without an end. */
const BAN_DURATIONS = ['7', '30', '365', 'forever'] as const;
type BanDuration = (typeof BAN_DURATIONS)[number];

const mutedText = 'text-sm text-[var(--color-ink-muted)]';

/**
 * `/admin/comments` (C-02, #128): the moderators' queues of comments — held for a moderator (a new
 * reader's, caught by the spam filter, reported enough times), published with reports, hidden — with
 * approve, hide, delete and «Запретить комментировать» per comment, and the list of current comment
 * bans. Admins only, as in the API.
 */
const AdminCommentsPage = () => {
  const locale = useLocale();
  const t = locale.commentModeration;
  const [queue, setQueue] = useState<CommentModerationQueue>('Pending');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const queueQuery = useQuery({
    queryKey: commentModerationQueryKey(queue, page),
    queryFn: () => getCommentModerationQueue(queue, page),
    placeholderData: keepPreviousData,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_COMMENT_MODERATION] }),
      queryClient.invalidateQueries({ queryKey: commentBansQueryKey() }),
    ]);
  };
  const data = queueQuery.data;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className={`mt-2 ${mutedText}`}>{t.description}</p>
      </div>
      <div role="group" aria-label={t.queuesLabel} className="flex flex-wrap gap-2">
        {QUEUES.map((value) => (
          <Button
            key={value}
            variant={value === queue ? 'primary' : undefined}
            aria-pressed={value === queue}
            onClick={() => {
              setQueue(value);
              setPage(1);
            }}
          >
            {`${t.queues[value]} (${data?.counts[COUNT_KEYS[value]] ?? 0})`}
          </Button>
        ))}
      </div>
      {queueQuery.isPending ? (
        <p className={mutedText}>{locale.common.loading}</p>
      ) : queueQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">{`${t.loadError}: ${extractApiErrorMessage(queueQuery.error)}`}</p>
      ) : data!.items.length === 0 ? (
        <p className={mutedText}>{t.empty[queue]}</p>
      ) : (
        <ul aria-label={t.listLabel} className="space-y-3">
          {data!.items.map((item) => <ModerationItem key={item.id} t={t} item={item} onChanged={refresh} />)}
        </ul>
      )}
      {total > pageSize ? (
        <nav aria-label={t.paginationLabel} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--color-ink-muted)]">{formatMessage(t.pageInfo, { from, to, total })}</span>
          <div className="flex gap-2">
            <Button className="px-3 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.previousPage}</Button>
            <Button className="px-3 py-1" disabled={to >= total} onClick={() => setPage(page + 1)}>{t.nextPage}</Button>
          </div>
        </nav>
      ) : null}
      <BanList t={t} onChanged={refresh} />
    </div>
  );
};

const ModerationItem: React.FC<{ t: Strings; item: CommentModerationItemDto; onChanged: () => Promise<void> }> = ({ t, item, onChanged }) => {
  const { date } = useFormat();
  const [mode, setMode] = useState<'view' | 'confirmDelete' | 'ban'>('view');
  const moderation = useMutation({
    mutationFn: (action: CommentModerationAction) => moderateComment(item.id, action),
    onSuccess: onChanged,
  });
  const removal = useMutation({ mutationFn: () => deleteArticleComment(item.id), onSuccess: onChanged });
  const error = moderation.error ?? removal.error;
  const author = item.authorId == null
    ? t.noAuthor
    : `${item.authorName ?? t.noName}${item.authorEmail ? ` (${item.authorEmail})` : ''}`;

  return (
    <li data-testid="moderation-item" data-comment-id={item.id}>
      <Card className="space-y-2">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-[var(--color-ink-strong)]">{author}</span>
          {item.authorBanned ? (
            <span className="text-xs text-red-700">
              {item.authorBannedUntil
                ? formatMessage(t.authorBanned, { date: date(item.authorBannedUntil, 'dateTime') })
                : t.authorBannedForever}
            </span>
          ) : null}
          <time dateTime={item.createdAt} className="text-xs text-[var(--color-ink-subtle)]">{date(item.createdAt, 'dateTime')}</time>
          {item.editedAt ? <span className="text-xs text-[var(--color-ink-subtle)]">{t.edited}</span> : null}
          {item.parentId != null ? <span className="text-xs text-[var(--color-ink-subtle)]">{t.reply}</span> : null}
          {item.holdReason ? (
            <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900">{t.holdReasons[item.holdReason]}</span>
          ) : null}
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {item.articlePublished ? (
            <Link to={`/${item.articleSlug}`} className="text-[var(--color-brand-forest)] hover:underline">
              {formatMessage(t.article, { title: item.articleTitle })}
            </Link>
          ) : (
            `${formatMessage(t.article, { title: item.articleTitle })} — ${t.articleUnpublished}`
          )}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-ink-strong)]">{item.body}</p>
        {item.reports.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-[var(--color-ink-strong)]">{formatMessage(t.reportsTitle, { count: item.reports.length })}</p>
            <ul className="mt-1 space-y-1 text-xs text-[var(--color-ink-muted)]">
              {item.reports.map((report, index) => (
                <li key={index}>
                  {formatMessage(t.reportBy, {
                    reason: t.reportReasons[report.reason],
                    name: report.reporterName ?? t.unknownReporter,
                    date: date(report.createdAt, 'dateTime'),
                  })}
                  {report.note ? <span className="block whitespace-pre-wrap ps-3 italic">{report.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="px-3 py-1 text-xs" disabled={moderation.isPending} onClick={() => moderation.mutate('Approve')}>
            {item.status === 'Hidden' ? t.restore : t.approve}
          </Button>
          {item.status !== 'Hidden' ? (
            <Button className="px-3 py-1 text-xs" disabled={moderation.isPending} onClick={() => moderation.mutate('Hide')}>{t.hide}</Button>
          ) : null}
          {item.articlePublished && mode !== 'confirmDelete' ? (
            <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setMode('confirmDelete')}>{t.delete}</Button>
          ) : null}
          {item.authorId != null && !item.authorBanned && mode !== 'ban' ? (
            <Button className="px-3 py-1 text-xs" onClick={() => setMode('ban')}>{t.ban}</Button>
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
        {error ? <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(error)}</p> : null}
        {mode === 'ban' && item.authorId != null ? (
          <BanForm
            t={t}
            userId={item.authorId}
            name={item.authorName ?? item.authorEmail ?? t.noName}
            onDone={async () => {
              setMode('view');
              await onChanged();
            }}
            onCancel={() => setMode('view')}
          />
        ) : null}
      </Card>
    </li>
  );
};

type BanFormProps = { t: Strings; userId: number; name: string; onDone: () => Promise<void>; onCancel: () => void };

const BanForm: React.FC<BanFormProps> = ({ t, userId, name, onDone, onCancel }) => {
  const id = useId();
  const [duration, setDuration] = useState<BanDuration>('7');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => banCommenter(userId, { days: duration === 'forever' ? null : Number(duration), reason: reason.trim() || null }),
    onSuccess: onDone,
  });

  return (
    <form
      aria-label={formatMessage(t.banLabel, { name })}
      className="space-y-2 rounded-xl border border-[var(--color-border-soft)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label htmlFor={`${id}-days`} className="block text-sm font-medium text-[var(--color-ink-strong)]">{t.banDays}</label>
      <select
        id={`${id}-days`}
        value={duration}
        onChange={(event) => setDuration(event.target.value as BanDuration)}
        className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
      >
        {BAN_DURATIONS.map((value) => <option key={value} value={value}>{t.banDurations[value]}</option>)}
      </select>
      <label htmlFor={`${id}-reason`} className="block text-sm text-[var(--color-ink-muted)]">{t.banReason}</label>
      <Textarea id={`${id}-reason`} value={reason} rows={2} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      {mutation.isError ? <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(mutation.error)}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" className="px-3 py-1 text-xs" disabled={mutation.isPending}>{t.banSubmit}</Button>
        <Button className="px-3 py-1 text-xs" onClick={onCancel}>{t.cancel}</Button>
      </div>
    </form>
  );
};

/** The users barred from commenting now, with «Снять запрет». */
const BanList: React.FC<{ t: Strings; onChanged: () => Promise<void> }> = ({ t, onChanged }) => {
  const { date } = useFormat();
  const bansQuery = useQuery({ queryKey: commentBansQueryKey(), queryFn: getCommentBans });
  const unban = useMutation({ mutationFn: unbanCommenter, onSuccess: onChanged });
  const bans = bansQuery.data ?? [];

  return (
    <section aria-labelledby="comment-bans-title" className="space-y-2 pt-4">
      <h2 id="comment-bans-title" className="text-lg font-semibold text-[var(--color-ink-strong)]">{t.bansTitle}</h2>
      {bansQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(bansQuery.error)}</p>
      ) : bansQuery.isPending ? null : bans.length === 0 ? (
        <p className={mutedText}>{t.bansEmpty}</p>
      ) : (
        <ul aria-label={t.bansLabel} className="space-y-2">
          {bans.map((ban) => (
            <li key={ban.userId} data-testid="comment-ban" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-[var(--color-ink-strong)]">{ban.displayName ? `${ban.displayName} (${ban.email})` : ban.email}</span>
              <span className="text-[var(--color-ink-muted)]">
                {ban.until ? formatMessage(t.banUntil, { date: date(ban.until, 'dateTime') }) : t.banForever}
              </span>
              {ban.createdByName ? (
                <span className="text-xs text-[var(--color-ink-subtle)]">
                  {formatMessage(t.banBy, { name: ban.createdByName, date: date(ban.createdAt, 'dateTime') })}
                </span>
              ) : null}
              {ban.reason ? <span className="w-full whitespace-pre-wrap text-xs italic text-[var(--color-ink-muted)]">{ban.reason}</span> : null}
              <Button className="px-3 py-1 text-xs" disabled={unban.isPending} onClick={() => unban.mutate(ban.userId)}>{t.unban}</Button>
            </li>
          ))}
        </ul>
      )}
      {unban.isError ? <p role="alert" className="text-sm text-red-600">{extractApiErrorMessage(unban.error)}</p> : null}
    </section>
  );
};

export default AdminCommentsPage;
