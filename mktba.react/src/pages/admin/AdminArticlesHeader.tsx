import { NavLink } from 'react-router-dom';
import { useLocale } from '../../localization/hooks';
import { cn } from '../../shared/lib/cn';

export const ARTICLE_LIST_PATH = '/admin/articles';
export const ARTICLE_TREE_PATH = '/admin/articles/tree';

/** The heading of the articles section with its two views: the table (A-02, #34) and the tree. */
export const AdminArticlesHeader = ({ description }: { description: string }) => {
  const locale = useLocale();
  const t = locale.adminArticleList;
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      isActive
        ? 'bg-white text-[var(--color-ink-strong)] shadow-sm'
        : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink-default)]',
    );

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-strong)]">{locale.adminLayout.sections.articles}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{description}</p>
      </div>
      <nav aria-label={t.viewsLabel} className="flex gap-1 rounded-xl bg-[var(--color-page-panel)] p-1">
        <NavLink to={ARTICLE_LIST_PATH} end className={tabClass}>
          {t.tabList}
        </NavLink>
        <NavLink to={ARTICLE_TREE_PATH} className={tabClass}>
          {t.tabTree}
        </NavLink>
      </nav>
    </div>
  );
};
