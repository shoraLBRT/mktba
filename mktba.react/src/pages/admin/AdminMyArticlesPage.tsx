import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { invalidateArticleQueries } from '../../app/queryClient';
import { PageLinks } from '../../components/PageLinks';
import { ArticleStatusBadge } from '../../components/article/ArticleStatusBadge';
import { ReturnedForRevisionNote } from '../../components/article/ArticleStatusPanel';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { changeArticleStatus, getMyArticles, MY_ARTICLES_PAGE_SIZE } from '../../services/adminService';
import { extractApiErrorMessage } from '../../shared/api-client/apiError';
import { ARTICLE_STATUSES } from '../../shared/articleListParams';
import { formatShortRussianDate } from '../../shared/lib/formatDate';
import { articleHref } from '../../shared/slug';
import type { ArticleListItemDto, ArticleStatus } from '../../shared/types/ApiTypes';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';

/** The quick moves of the cabinet: an author's own ones (submit a draft, take it back); the rest stay in the editor. */
const QUICK_MOVES: readonly ArticleStatus[] = ['InReview', 'Draft'];

const PATH = '/admin/my-articles';

const statusFrom = (value: string | null): ArticleStatus | null =>
  ARTICLE_STATUSES.find((status) => status === value) ?? null;

const pageFrom = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const hrefFor = (status: ArticleStatus | null, page = 1): string => {
  const query = new URLSearchParams();
  if (status) {
    query.set('status', status);
  }
  if (page > 1) {
    query.set('page', String(page));
  }
  const search = query.toString();
  return search ? `${PATH}?${search}` : PATH;
};

/**
 * The author's cabinet (P-02, #90): the articles the signed-in user writes or co-writes, by status,
 * with a reviewer's comment on a returned draft and the quick actions — edit, submit for review or
 * take back (only what `allowedTransitions` gives), open on the site once published.
 */
const AdminMyArticlesPage = () => {
  const locale = useLocale();
  const t = locale.adminMyArticles;
  const [searchParams] = useSearchParams();
  const status = statusFrom(searchParams.get('status'));
  const page = pageFrom(searchParams.get('page'));

  const listQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, 'mine', status, page],
    queryFn: () => getMyArticles(status, page),
    placeholderData: keepPreviousData,
  });
  const items = listQuery.data?.items ?? [];
  const pageCount = Math.ceil((listQuery.data?.total ?? 0) / MY_ARTICLES_PAGE_SIZE);
  const tabClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active
      ? 'border-[var(--color-brand-forest)] bg-[var(--color-surface-muted)] font-medium text-[var(--color-ink-strong)]'
      : 'border-[var(--color-border-soft)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--color-ink-strong)]">{locale.adminLayout.sections.mine}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{t.description}</p>
      </div>
      <nav aria-label={t.filterLabel} className="flex flex-wrap gap-2">
        {[null, ...ARTICLE_STATUSES].map((option) => (
          <Link
            key={option ?? 'all'}
            to={hrefFor(option)}
            aria-current={option === status ? 'page' : undefined}
            className={tabClass(option === status)}
          >
            {option ? locale.articleStatus[option] : t.all}
          </Link>
        ))}
      </nav>
      <Card className="p-6">
        {listQuery.isPending && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{locale.common.loading}</p>}
        {listQuery.isError && (
          <p className="m-0 text-sm text-red-600" role="alert">
            {t.loadError}: {extractApiErrorMessage(listQuery.error)}
          </p>
        )}
        {listQuery.isSuccess && items.length === 0 && <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>}
        {items.length > 0 && (
          <ul className="m-0 list-none divide-y divide-[var(--color-border-soft)] p-0" aria-label={locale.adminLayout.sections.mine}>
            {items.map((item) => (
              <MyArticleRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Card>
      <PageLinks label={locale.adminLayout.sections.mine} page={page} pageCount={pageCount} hrefFor={(target) => hrefFor(status, target)} />
    </div>
  );
};

const MyArticleRow = ({ item }: { item: ArticleListItemDto }) => {
  const locale = useLocale();
  const t = locale.adminMyArticles;
  const queryClient = useQueryClient();
  const moves = item.allowedTransitions.filter((target) => QUICK_MOVES.includes(target));
  const linkClass = 'rounded-full border border-[var(--color-border-soft)] px-4 py-1.5 text-sm text-[var(--color-brand-forest)] hover:bg-[var(--color-surface-muted)]';

  const mutation = useMutation({
    mutationFn: (target: ArticleStatus) => changeArticleStatus(item.id, target),
    onSuccess: () => invalidateArticleQueries(queryClient),
  });

  return (
    <li className="space-y-2 py-4" data-testid={`my-article-${item.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="m-0 flex flex-wrap items-center gap-2 font-medium text-[var(--color-ink-strong)]">
            {item.title}
            <ArticleStatusBadge status={item.status} compact />
          </p>
          <p className="m-0 text-xs text-[var(--color-ink-subtle)]">
            {formatMessage(t.updated, { date: formatShortRussianDate(item.updatedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.canEdit && <Link to={`/admin/articles/${item.id}/edit`} className={linkClass}>{t.edit}</Link>}
          {item.canEdit && <Link to={`/admin/articles/${item.id}/analytics`} className={linkClass}>{locale.articleAnalytics.openLink}</Link>}
          {item.status === 'Published' && <Link to={articleHref(item.slug)} className={linkClass}>{t.openOnSite}</Link>}
          {moves.map((target) => (
            <Button key={target} className="px-3 py-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate(target)}>
              {locale.editArticlePage.statusActions[target]}
            </Button>
          ))}
        </div>
      </div>
      <ReturnedForRevisionNote article={item} />
      {mutation.isError && (
        <p className="m-0 text-xs text-red-600" role="alert">
          {locale.editArticlePage.statusChangeError}: {extractApiErrorMessage(mutation.error)}
        </p>
      )}
    </li>
  );
};

export default AdminMyArticlesPage;
