import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateArticleQueries } from '../../app/queryClient';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import { NoticeBanner } from '../../components/admin/NoticeBanner';
import { useNotice } from '../../components/admin/useNotice';
import { formatMessage } from '../../localization';
import { useFormat, useLocale } from '../../localization/hooks';
import { getArticleTrash, purgeArticle, restoreArticleFromTrash, TRASH_QUERY_KEY } from '../../services/Article/trashService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import type { ArticleTrashItemDto } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';


/**
 * `/admin/trash` (M-11, #133): the trashed articles, each restored to its place or deleted for good.
 * Admins only, as in the API. An article whose section is in the trash too waits for the section.
 */
const AdminTrashPage = () => {
  const locale = useLocale();
  const t = locale.articleTrash;
  const format = useFormat();
  const queryClient = useQueryClient();
  const { notice, showNotice, clearNotice } = useNotice();
  const trashQuery = useQuery({ queryKey: TRASH_QUERY_KEY, queryFn: getArticleTrash });
  const items = trashQuery.data ?? [];

  const settle = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: TRASH_QUERY_KEY }), invalidateArticleQueries(queryClient)]);
  const onError = (error: unknown) => showNotice('error', `${t.actionError}: ${extractApiErrorMessage(error)}`);
  const restoreMutation = useMutation({
    mutationFn: (item: ArticleTrashItemDto) => restoreArticleFromTrash(item.id),
    onSuccess: (_, item) => showNotice('success', formatMessage(t.restored, { title: item.title })),
    onError,
    onSettled: settle,
  });
  const purgeMutation = useMutation({
    mutationFn: (item: ArticleTrashItemDto) => purgeArticle(item.id),
    onSuccess: (_, item) => showNotice('success', formatMessage(t.purged, { title: item.title })),
    onError,
    onSettled: settle,
  });
  const busy = restoreMutation.isPending || purgeMutation.isPending;

  const parentLabel = (item: ArticleTrashItemDto) => {
    if (item.parentArticleId === null || item.parentArticleId === undefined) return t.rootParent;
    const title = item.parentTitle ?? `#${item.parentArticleId}`;
    return item.parentInTrash ? formatMessage(t.parentInTrash, { title }) : title;
  };

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} onClose={clearNotice} />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{t.title}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <Card className="overflow-hidden p-0">
        {trashQuery.isPending ? (
          <p className="m-0 px-4 py-6 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>
        ) : trashQuery.isError ? (
          <p role="alert" className="m-0 px-4 py-6 text-sm text-red-600">
            {`${t.loadError}: ${extractApiErrorMessage(trashQuery.error)}`}
          </p>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.tableLabel} className="w-full border-collapse text-sm">
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.title}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.status}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.parent}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t.columns.deletedAt}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} data-testid={`trash-row-${item.id}`} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--color-ink-strong)]">{item.title}</div>
                      <div className="text-[11px] text-[var(--color-ink-subtle)]">{`${item.slug} · ${item.locale}`}</div>
                    </td>
                    <td className="px-3 py-2"><ArticleStatusBadge status={item.status} compact /></td>
                    <td className="px-3 py-2 text-[var(--color-ink-muted)]">{parentLabel(item)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-[var(--color-ink-muted)]">
                      {item.deletedByDisplayName
                        ? formatMessage(t.deletedBy, { date: format.date(item.deletedAt, 'dateTime'), name: item.deletedByDisplayName })
                        : format.date(item.deletedAt, 'dateTime')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={busy || item.parentInTrash}
                          title={item.parentInTrash ? t.restoreBlocked : undefined}
                          onClick={() => restoreMutation.mutate(item)}
                        >
                          {t.restore}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(formatMessage(t.purgeConfirm, { title: item.title }))) {
                              purgeMutation.mutate(item);
                            }
                          }}
                        >
                          {t.purge}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminTrashPage;
