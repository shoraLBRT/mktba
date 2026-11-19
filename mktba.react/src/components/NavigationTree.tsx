import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLocale } from '../localization/hooks';
import { ArticleStatusBadge } from './article/ArticleStatusBadge';
import { articleHref } from '../shared/slug';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';

interface NavigationTreeProps {
  navigationTree?: NavigationArticleDto[];
  showArticleEditActions?: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
}

type NavigationItemProps = {
  article: NavigationArticleDto;
  depth: number;
  activeArticleId?: number;
  showArticleEditActions: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
};

const NavigationItem: React.FC<NavigationItemProps> = ({
  article,
  depth,
  activeArticleId,
  showArticleEditActions,
  onNavigate,
  onAddChild,
}) => {
  const locale = useLocale();
  const hasChildren = (article.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(true);
  const isActive = article.id === activeArticleId;
  // An article without content is a stub (a Published section heading, say): not a link for
  // readers, but the admin must be able to open its editor to fill it in (see docs/backlog.md, A1).
  const isClickable = article.hasContent || showArticleEditActions;

  return (
    <div>
      <div
        className={[
          'group flex items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors',
          isActive
            ? 'bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]'
            : 'text-[var(--color-ink-default)] hover:bg-[rgba(255,255,255,0.75)] hover:text-[var(--color-ink-strong)]',
        ].join(' ')}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[var(--color-ink-subtle)] transition-colors hover:bg-white hover:text-[var(--color-ink-default)]"
            aria-label={expanded ? locale.navigationTree.collapseSection : locale.navigationTree.expandSection}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : (
          <span className="block h-[18px] w-[18px] shrink-0" />
        )}

        {isClickable ? (
          <Link
            to={showArticleEditActions ? `/admin/articles/${article.id}/edit` : articleHref(article.slug)}
            className={[
              'min-w-0 flex-1 truncate text-[12px] leading-5',
              isActive ? 'font-medium' : '',
              article.hasContent ? '' : 'text-[var(--color-ink-muted)]',
            ].join(' ')}
            onClick={onNavigate}
          >
            {article.title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[var(--color-ink-muted)]">{article.title}</span>
        )}

        {showArticleEditActions && article.status !== 'Published' ? <ArticleStatusBadge status={article.status} compact /> : null}

        {onAddChild ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAddChild(article.id, article.title);
            }}
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[var(--color-ink-subtle)] opacity-0 transition-all hover:bg-white hover:text-[var(--color-ink-default)] focus:opacity-100 group-hover:opacity-100"
            title={locale.navigationTree.addChild}
            aria-label={locale.navigationTree.addChild}
          >
            <Plus size={11} />
          </button>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <div className="mt-0.5 space-y-px">
          {article.children?.map((child) => (
            <NavigationItem
              key={child.id}
              article={child}
              depth={depth + 1}
              activeArticleId={activeArticleId}
              showArticleEditActions={showArticleEditActions}
              onNavigate={onNavigate}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const findArticleIdBySlug = (articles: NavigationArticleDto[] | undefined, slug: string): number | undefined => {
  for (const article of articles ?? []) {
    if (article.slug === slug) return article.id;
    const nested = findArticleIdBySlug(article.children ?? undefined, slug);
    if (nested !== undefined) return nested;
  }
  return undefined;
};

const NavigationTree: React.FC<NavigationTreeProps> = ({
  navigationTree,
  showArticleEditActions = false,
  onNavigate,
  onAddChild,
}) => {
  const location = useLocation();

  const activeArticleId = useMemo(() => {
    const readMatch = location.pathname.match(/^\/article\/([^/]+)$/);
    if (readMatch) {
      const segment = decodeURIComponent(readMatch[1]);
      return /^\d+$/.test(segment) ? Number(segment) : findArticleIdBySlug(navigationTree, segment);
    }

    const editMatch = location.pathname.match(/^\/admin\/articles\/(\d+)\/edit$/);
    if (editMatch) return Number(editMatch[1]);

    return undefined;
  }, [location.pathname, navigationTree]);

  return (
    <div className="space-y-px">
      {navigationTree?.map((article) => (
        <NavigationItem
          key={article.id}
          article={article}
          depth={0}
          activeArticleId={activeArticleId}
          showArticleEditActions={showArticleEditActions}
          onNavigate={onNavigate}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
};

export default NavigationTree;
