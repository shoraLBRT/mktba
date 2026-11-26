import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { auditLogQueryKey, getAuditLog, type AuditLogFilter } from '../../services/auditLog/auditLogService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { ArticleStatus, AuditAction, AuditLogEntryDto, UserRole } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

/** The actions in the filter, in the order of the API's enum. */
const AUDIT_ACTIONS: readonly AuditAction[] = [
  'ArticleStatusChanged',
  'ArticleTrashed',
  'ArticleRestored',
  'ArticlePurged',
  'UserRoleChanged',
  'ScholarApplicationApproved',
  'ScholarApplicationRejected',
  'ScholarStatusRevoked',
];

const PAGE_SIZE = 50;

const isAuditAction = (value: string): value is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(value);

/**
 * `/admin/audit` (U-09, #135): the audit log — who changed an article's status, trashed, restored or
 * purged an article, or gave a user another role, and when. Newest first, filtered by action, 50 a
 * page. Admins only, as in the API. Users and articles are named as they are now; an article that is
 * in the trash or gone keeps the title it had and has no link.
 */
const AdminAuditLogPage = () => {
  const locale = useLocale();
  const t = locale.auditLog;
  const format = useFormat();
  const [filter, setFilter] = useState<AuditLogFilter>({ page: 1, pageSize: PAGE_SIZE });
  const logQuery = useQuery({
    queryKey: auditLogQueryKey(filter),
    queryFn: () => getAuditLog(filter),
    placeholderData: keepPreviousData,
  });
  const items = logQuery.data?.items ?? [];
  const total = logQuery.data?.total ?? 0;
  const page = logQuery.data?.page ?? filter.page;
  const pageSize = logQuery.data?.pageSize ?? filter.pageSize;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const userLabel = (id: number | null | undefined, user: AuditLogEntryDto['actor']) => {
    if (user) return user.displayName ? `${user.displayName} (${user.email})` : user.email;
    if (id === null || id === undefined) return t.noActor;
    return formatMessage(t.deletedUser, { id });
  };

  const valueLabel = (entry: AuditLogEntryDto, value: string | null | undefined) => {
    if (!value) return '';
    if (entry.action === 'UserRoleChanged') return locale.userRole[value as UserRole] ?? value;
    return locale.articleStatus[value as ArticleStatus] ?? value;
  };

  const target = (entry: AuditLogEntryDto) => {
    if (entry.targetUserId !== null && entry.targetUserId !== undefined) return userLabel(entry.targetUserId, entry.targetUser);
    if (entry.articleId === null || entry.articleId === undefined) return '';
    const title = entry.articleTitle ?? formatMessage(t.articleFallback, { id: entry.articleId });
    return entry.articleAvailable ? (
      <Link to={`/admin/articles/${entry.articleId}/edit`} className="text-[var(--color-brand-forest)] hover:underline">
        {title}
      </Link>
    ) : (
      formatMessage(t.articleUnavailable, { title })
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="audit-log-action" className="text-sm text-[var(--color-ink-muted)]">{t.filterLabel}</label>
        <select
          id="audit-log-action"
          value={filter.action ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            setFilter({ ...filter, action: isAuditAction(value) ? value : undefined, page: 1 });
          }}
          className="h-9 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
        >
          <option value="">{t.allActions}</option>
          {AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{t.actions[action]}</option>)}
        </select>
      </div>
      <Card className="overflow-hidden p-0">
        {logQuery.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : logQuery.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">
            {`${t.loadError}: ${extractApiErrorMessage(logQuery.error)}`}
          </p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.tableLabel} className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.occurredAt}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.actor}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.action}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.target}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.change}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} data-testid={`audit-row-${entry.id}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-[var(--color-ink-muted)]">{format.date(entry.occurredAt, 'dateTime')}</td>
                    <td className="px-3 py-2">{userLabel(entry.actorId, entry.actor)}</td>
                    <td className="px-3 py-2">{t.actions[entry.action]}</td>
                    <td className="px-3 py-2">{target(entry)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[var(--color-ink-muted)]">
                      {entry.fromValue && entry.toValue
                        ? formatMessage(t.change, { from: valueLabel(entry, entry.fromValue), to: valueLabel(entry, entry.toValue) })
                        : ''}
                    </td>
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

export default AdminAuditLogPage;
