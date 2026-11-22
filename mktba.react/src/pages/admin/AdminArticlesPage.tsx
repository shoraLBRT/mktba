import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { invalidateArticleQueries } from '../../app/queryClient';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { bulkChangeArticleStatus, getArticleList, getUsers } from '../../services/adminService';
import { extractApiErrorMessage, translateApiError } from '../../shared/api-client/apiError';
import {
  ARTICLE_STATUSES,
  DEFAULT_ARTICLE_LIST_PARAMS,
  PAGE_SIZES,
  parseArticleListParams,
  toArticleListQuery,
  type ArticleListParams,
  type ArticleListSort,
} from '../../shared/articleListParams';
import { formatShortRussianDate } from '../../shared/lib/formatDate';
import { articleHref } from '../../shared/slug';
import type { ArticleListItemDto, ArticleStatus } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { AdminArticlesHeader } from './AdminArticlesHeader';
import { BulkStatusConfirmModal } from './BulkStatusConfirmModal';

const SEARCH_DEBOUNCE_MS = 300;

type BulkOutcome = { ok: number; total: number; failures: string[] };

const selectClass = 'h-9 w-full rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm';
const labelClass = 'mb-1 block text-[12px] font-medium text-[var(--color-ink-default)]';

/** A text filter typed into a field and written to the URL once typing pauses. */
const useDebouncedFilter = (value: string, commit: (next: string) => void) => {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  if (value !== committed) {
    // The URL changed from outside (reset, back button): show what it says now.
    setCommitted(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) {
      return undefined;
    }

    const timer = window.setTimeout(() => commit(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value, commit]);

  return [draft, setDraft] as const;
};

/**
 * `/admin/articles`: the article table (A-02, #34) — search, filters, sorting and paging on the
 * server, kept in the URL query, and status changes for several articles at once. An author sees
 * the Published articles and their own; the tree view is one tab away.
 */
const AdminArticlesPage = () => {
  const locale = useLocale();
  const t = locale.adminArticleList;
  const queryClient = useQueryClient();
  const { user, can } = useCurrentUser();
  const seesUsers = can('canManageUsers');
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseArticleListParams(searchParams);
  const listKey = toArticleListQuery(params).toString();

  const update = (patch: Partial<ArticleListParams>) => {
    const keepsPage = Object.keys(patch).every((key) => key === 'page');
    setSearchParams(toArticleListQuery({ ...params, ...(keepsPage ? {} : { page: 1 }), ...patch }));
  };

  const [search, setSearch] = useDebouncedFilter(params.search, (next) => update({ search: next }));
  const [tag, setTag] = useDebouncedFilter(params.tag, (next) => update({ tag: next }));

  const listQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, 'list', listKey],
    queryFn: () => getArticleList(params),
    placeholderData: keepPreviousData,
  });
  const usersQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_USERS],
    queryFn: getUsers,
    enabled: seesUsers,
  });

  // The selection belongs to one page of one query; turning the page or changing a filter drops it.
  const [selection, setSelection] = useState<{ key: string; ids: number[] }>({ key: listKey, ids: [] });
  const selectedIds = selection.key === listKey ? selection.ids : [];
  const setSelectedIds = (ids: number[]) => setSelection({ key: listKey, ids });

  const [confirmStatus, setConfirmStatus] = useState<ArticleStatus | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const items = listQuery.data?.items ?? [];
  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const bulkTargets = ARTICLE_STATUSES.filter((status) =>
    selectedItems.some((item) => item.allowedTransitions.includes(status)),
  );

  const bulkMutation = useMutation({
    mutationFn: (status: ArticleStatus) => bulkChangeArticleStatus({ ids: selectedIds, status }),
    onSuccess: (result) => {
      const titles = new Map(items.map((item) => [item.id, item.title]));
      setOutcome({
        ok: result.results.filter((entry) => entry.ok).length,
        total: result.results.length,
        failures: result.results
          .filter((entry) => !entry.ok)
          .map((entry) => `${titles.get(entry.id) ?? `#${entry.id}`}: ${translateApiError(entry.code ?? undefined)}`),
      });
      setBulkError(null);
      setConfirmStatus(null);
      setSelectedIds([]);
      void invalidateArticleQueries(queryClient);
    },
    onError: (failure) => {
      setBulkError(`${t.bulkError}: ${extractApiErrorMessage(failure)}`);
      setConfirmStatus(null);
    },
  });

  const userEmails = new Map((usersQuery.data ?? []).map((entry) => [entry.id, entry.email]));
  const authorLabel = (authorId: number | null | undefined) => {
    if (authorId === null || authorId === undefined) return t.noValue;
    if (authorId === user?.id) return t.authorYou;
    return userEmails.get(authorId) ?? formatMessage(t.authorById, { id: authorId });
  };

  const toggleSort = (sort: ArticleListSort) =>
    update(
      params.sort === sort
        ? { dir: params.dir === 'Asc' ? 'Desc' : 'Asc' }
        : { sort, dir: sort === 'Title' || sort === 'Status' ? 'Asc' : 'Desc' },
    );

  const sortHeader = (sort: ArticleListSort, label: string) => {
    const active = params.sort === sort;
    return (
      <th
        key={sort}
        scope="col"
        aria-sort={active ? (params.dir === 'Asc' ? 'ascending' : 'descending') : undefined}
        className="px-3 py-2 text-left font-medium"
      >
        <button
          type="button"
          onClick={() => toggleSort(sort)}
          title={formatMessage(t.sortHint, { column: label })}
          className="inline-flex items-center gap-1 hover:text-[var(--color-ink-strong)]"
        >
          {label}
          {active ? params.dir === 'Asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
        </button>
      </th>
    );
  };

  const total = listQuery.data?.total ?? 0;
  const page = listQuery.data?.page ?? params.page;
  const pageSize = listQuery.data?.pageSize ?? params.pageSize;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const titleCell = (item: ArticleListItemDto) => {
    const href = item.canEdit
      ? `/admin/articles/${item.id}/edit`
      : item.status === 'Published'
        ? articleHref(item.slug)
        : null;
    return (
      <div className="min-w-[12rem]">
        {href ? (
          <Link to={href} className="font-medium text-[var(--color-ink-strong)] hover:underline">
            {item.title}
          </Link>
        ) : (
          <span className="font-medium text-[var(--color-ink-strong)]">{item.title}</span>
        )}
        <div className="text-[11px] text-[var(--color-ink-subtle)]">
          {item.slug}
          {item.canEdit ? (
            <>
              {' · '}
              <Link to={`/admin/articles/${item.id}/analytics`} className="text-[var(--color-brand-forest)] hover:underline">
                {locale.articleAnalytics.openLink}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <AdminArticlesHeader description={t.description} />

      <Card className="p-3">
        <form
          aria-label={t.filtersLabel}
          onSubmit={(event) => event.preventDefault()}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
        >
          <div>
            <label htmlFor="article-list-search" className={labelClass}>{t.searchLabel}</label>
            <Input
              id="article-list-search"
              type="search"
              value={search}
              placeholder={t.searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 py-1"
            />
          </div>
          <div>
            <label htmlFor="article-list-status" className={labelClass}>{t.statusFilter}</label>
            <select
              id="article-list-status"
              value={params.status ?? ''}
              onChange={(event) => update({ status: (event.target.value || null) as ArticleStatus | null })}
              className={selectClass}
            >
              <option value="">{t.allStatuses}</option>
              {ARTICLE_STATUSES.map((status) => (
                <option key={status} value={status}>{locale.articleStatus[status]}</option>
              ))}
            </select>
          </div>
          {seesUsers ? (
            <div>
              <label htmlFor="article-list-author" className={labelClass}>{t.authorFilter}</label>
              <select
                id="article-list-author"
                value={params.authorId ?? ''}
                onChange={(event) => update({ authorId: event.target.value ? Number(event.target.value) : null })}
                className={selectClass}
              >
                <option value="">{t.allAuthors}</option>
                {(usersQuery.data ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.email}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label htmlFor="article-list-tag" className={labelClass}>{t.tagFilter}</label>
            <Input
              id="article-list-tag"
              value={tag}
              placeholder={t.tagPlaceholder}
              onChange={(event) => setTag(event.target.value)}
              className="h-9 py-1"
            />
          </div>
          <div>
            <label htmlFor="article-list-locale" className={labelClass}>{t.localeFilter}</label>
            <select
              id="article-list-locale"
              value={params.locale}
              onChange={(event) => update({ locale: event.target.value })}
              className={selectClass}
            >
              <option value="">{t.allLocales}</option>
              {Object.entries(t.locales).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>
          <Button
            variant="ghost"
            className="h-9"
            onClick={() => setSearchParams(toArticleListQuery({ ...DEFAULT_ARTICLE_LIST_PARAMS, pageSize: params.pageSize }))}
          >
            {t.resetFilters}
          </Button>
        </form>
      </Card>

      {selectedIds.length > 0 ? (
        <Card
          role="region"
          aria-label={t.bulkLabel}
          className="flex flex-wrap items-center gap-2 border border-[var(--color-brand-forest)] px-3 py-2"
        >
          <span className="text-sm font-medium text-[var(--color-ink-strong)]">
            {formatMessage(t.selectedCount, { count: selectedIds.length })}
          </span>
          {bulkTargets.map((status) => (
            <Button key={status} className="px-3 py-1.5" onClick={() => setConfirmStatus(status)}>
              {locale.editArticlePage.statusActions[status]}
            </Button>
          ))}
          <Button variant="ghost" className="ml-auto px-3 py-1.5" onClick={() => setSelectedIds([])}>
            {t.clearSelection}
          </Button>
        </Card>
      ) : null}

      {outcome ? (
        <div role="status" className="rounded-xl border border-[var(--color-border-soft)] bg-white px-4 py-3 text-sm">
          <p className="m-0">{formatMessage(t.bulkDone, { ok: outcome.ok, total: outcome.total })}</p>
          {outcome.failures.length > 0 ? (
            <>
              <p className="mb-0 mt-2 font-medium">{t.bulkSkipped}</p>
              <ul className="mb-0 mt-1 list-disc pl-5 text-[var(--color-ink-muted)]">
                {outcome.failures.map((failure) => <li key={failure}>{failure}</li>)}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {bulkError ? <p role="alert" className="m-0 text-sm text-red-600">{bulkError}</p> : null}

      <Card className="overflow-hidden">
        {listQuery.isError ? (
          <div role="alert" className="px-4 py-3 text-sm text-red-700">
            {t.loadError}: {extractApiErrorMessage(listQuery.error)}
          </div>
        ) : listQuery.isPending ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-border-soft)] border-t-[var(--color-brand-forest)]" />
          </div>
        ) : items.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t.tableLabel} className={`w-full border-collapse text-sm ${listQuery.isPlaceholderData ? 'opacity-60' : ''}`}>
              <thead className="bg-[var(--color-page-panel)] text-[12px] text-[var(--color-ink-muted)]">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={t.selectAll}
                      checked={allSelected}
                      onChange={() => setSelectedIds(allSelected ? [] : items.map((item) => item.id))}
                    />
                  </th>
                  {sortHeader('Title', t.columns.title)}
                  {sortHeader('Status', t.columns.status)}
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t.columns.author}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t.columns.locale}</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">{t.columns.tags}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t.columns.paragraphs}</th>
                  {sortHeader('UpdatedAt', t.columns.updatedAt)}
                  {sortHeader('PublishedAt', t.columns.publishedAt)}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--color-border-soft)] align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={formatMessage(t.selectRow, { title: item.title })}
                        checked={selectedIds.includes(item.id)}
                        onChange={(event) =>
                          setSelectedIds(
                            event.target.checked
                              ? [...selectedIds, item.id]
                              : selectedIds.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{titleCell(item)}</td>
                    <td className="px-3 py-2"><ArticleStatusBadge status={item.status} /></td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-[var(--color-ink-muted)]">{authorLabel(item.authorId)}</td>
                    <td className="px-3 py-2 uppercase text-[var(--color-ink-muted)]">{item.locale}</td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[6rem] flex-wrap gap-1">
                        {item.tags.length === 0 ? <span className="text-[var(--color-ink-subtle)]">{t.noValue}</span> : null}
                        {item.tags.map((entry) => (
                          <button
                            key={entry}
                            type="button"
                            onClick={() => update({ tag: entry })}
                            className="rounded-full bg-[var(--color-page-panel)] px-2 text-[11px] text-[var(--color-ink-default)] hover:bg-[var(--color-border-soft)]"
                          >
                            {entry}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.paragraphCount}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-ink-muted)]">{formatShortRussianDate(item.updatedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-ink-muted)]">
                      {item.publishedAt ? formatShortRussianDate(item.publishedAt) : t.noValue}
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
            <label htmlFor="article-list-page-size" className="text-[12px] text-[var(--color-ink-muted)]">{t.pageSizeLabel}</label>
            <select
              id="article-list-page-size"
              value={params.pageSize}
              onChange={(event) => update({ pageSize: Number(event.target.value) })}
              className="h-8 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-sm"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <Button className="px-3 py-1" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
              {t.previousPage}
            </Button>
            <Button className="px-3 py-1" disabled={to >= total} onClick={() => update({ page: page + 1 })}>
              {t.nextPage}
            </Button>
          </div>
        </nav>
      </Card>

      {confirmStatus ? (
        <BulkStatusConfirmModal
          status={confirmStatus}
          count={selectedIds.length}
          isPending={bulkMutation.isPending}
          onConfirm={() => bulkMutation.mutate(confirmStatus)}
          onClose={() => setConfirmStatus(null)}
        />
      ) : null}
    </div>
  );
};

export default AdminArticlesPage;
