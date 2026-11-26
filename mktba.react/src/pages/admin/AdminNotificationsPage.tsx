import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { cn } from '../../shared/lib/cn';
import { notificationHref, notificationText } from '../../shared/notifications';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

/**
 * `/admin/notifications` (V-09, #125): the signed-in user's notifications, newest first, 20 a page —
 * all or only the unread. Following one marks it read; «Отметить все прочитанными» clears the bell.
 */
const AdminNotificationsPage = () => {
  const locale = useLocale();
  const t = locale.notifications;
  const format = useFormat();
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const listQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.NOTIFICATIONS, unreadOnly, page],
    queryFn: () => getNotifications({ unread: unreadOnly, page }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.NOTIFICATIONS] });
    void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.NOTIFICATIONS_UNREAD] });
  };
  const onFailure = (error: unknown) => showNotice('error', `${t.markFailed}: ${extractApiErrorMessage(error)}`);
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh, onError: onFailure });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh, onError: onFailure });

  const data = listQuery.data;
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const choose = (value: boolean) => {
    setUnreadOnly(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.hint}</p>
      </div>
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t.filterLabel} className="flex gap-1">
          <Button className="px-3 py-1" variant={unreadOnly ? 'secondary' : 'primary'} aria-pressed={!unreadOnly} onClick={() => choose(false)}>
            {t.showAll}
          </Button>
          <Button className="px-3 py-1" variant={unreadOnly ? 'primary' : 'secondary'} aria-pressed={unreadOnly} onClick={() => choose(true)}>
            {t.showUnread}
          </Button>
        </div>
        <span className="text-sm text-[var(--color-ink-muted)]" data-testid="notifications-unread">
          {formatMessage(t.unreadCount, { count: unread })}
        </span>
        <Button className="ms-auto px-3 py-1" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate()}>
          {t.markAllRead}
        </Button>
      </div>
      <Card className="overflow-hidden p-0">
        {listQuery.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : listQuery.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">
            {`${t.loadError}: ${extractApiErrorMessage(listQuery.error)}`}
          </p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{unreadOnly ? t.emptyUnread : t.empty}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {items.map((item) => {
              const href = notificationHref(item);
              const isUnread = item.readAt == null;
              const text = notificationText(item, t);
              return (
                <li
                  key={item.id}
                  data-testid={`notification-${item.id}`}
                  className={cn(
                    'flex flex-wrap items-start gap-3 border-t border-[var(--color-border-soft)] px-4 py-3 first:border-t-0',
                    isUnread && 'bg-[var(--color-brand-forest-soft)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm text-[var(--color-ink-strong)] break-words">
                      {isUnread ? (
                        <span className="me-2 rounded-full bg-[var(--color-brand-forest)] px-2 py-0.5 text-[11px] font-semibold text-white">
                          {t.unreadBadge}
                        </span>
                      ) : null}
                      {href ? (
                        <Link
                          to={href}
                          onClick={() => {
                            if (isUnread) readOne.mutate(item.id);
                          }}
                          className="text-[var(--color-ink-strong)] hover:text-[var(--color-brand-forest)] hover:underline"
                        >
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </p>
                    {item.excerpt ? (
                      <p className="m-0 mt-1 text-sm text-[var(--color-ink-muted)] break-words">{`«${item.excerpt}»`}</p>
                    ) : null}
                    <p className="m-0 mt-1 text-xs text-[var(--color-ink-subtle)]">
                      {[format.date(item.createdAt, 'dateTime'), item.actorName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {isUnread ? (
                    <Button
                      className="px-3 py-1 text-xs"
                      disabled={readOne.isPending}
                      aria-label={`${t.markRead}: ${text}`}
                      onClick={() => readOne.mutate(item.id)}
                    >
                      {t.markRead}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 ? (
          <nav
            aria-label={t.title}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-soft)] px-3 py-2 text-sm"
          >
            <span className="text-[var(--color-ink-muted)]">{formatMessage(t.pageOf, { page, pages })}</span>
            <div className="flex items-center gap-2">
              <Button className="px-3 py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t.previous}
              </Button>
              <Button className="px-3 py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                {t.next}
              </Button>
            </div>
          </nav>
        ) : null}
      </Card>
    </div>
  );
};

export default AdminNotificationsPage;
