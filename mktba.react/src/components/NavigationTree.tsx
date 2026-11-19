import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderInput, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useLocale } from '../localization/hooks';
import { ArticleStatusBadge } from './article/ArticleStatusBadge';
import { articleHref } from '../shared/slug';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';

interface NavigationTreeProps {
  navigationTree?: NavigationArticleDto[];
  showArticleEditActions?: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
  /** Admin reorder: puts the article at a 0-based index among the children of parentId (null: roots). */
  onMove?: (articleId: number, parentId: number | null, index: number) => void;
  /** Admin: opens the parent picker for the article. */
  onChangeParent?: (article: NavigationArticleDto, parentId: number | null) => void;
}

type NavigationItemProps = {
  article: NavigationArticleDto;
  depth: number;
  parentId: number | null;
  index: number;
  siblingCount: number;
  activeArticleId?: number;
  showArticleEditActions: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
  onMove?: NavigationTreeProps['onMove'];
  onChangeParent?: NavigationTreeProps['onChangeParent'];
};

const actionButtonClass =
  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[var(--color-ink-subtle)] opacity-0 transition-all hover:bg-white hover:text-[var(--color-ink-default)] focus:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0';

type ActionButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
};

const ActionButton: React.FC<ActionButtonProps> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    className={actionButtonClass}
    title={label}
    aria-label={label}
  >
    {children}
  </button>
);

const NavigationItem: React.FC<NavigationItemProps> = ({
  article,
  depth,
  parentId,
  index,
  siblingCount,
  activeArticleId,
  showArticleEditActions,
  onNavigate,
  onAddChild,
  onMove,
  onChangeParent,
}) => {
  const locale = useLocale();
  const hasChildren = (article.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(true);
  const isActive = article.id === activeArticleId;
  // An article without content is a stub (a Published section heading, say): not a link for
  // readers, but whoever may edit it must be able to open its editor to fill it in (see
  // docs/backlog.md, A1). The API says per article whether the caller may edit it (U-02).
  const opensEditor = showArticleEditActions && article.canEdit;
  const isClickable = article.hasContent || opensEditor;

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
            to={opensEditor ? `/admin/articles/${article.id}/edit` : articleHref(article.slug)}
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

        {onMove ? (
          <>
            <ActionButton
              label={locale.navigationTree.moveUp}
              disabled={index === 0}
              onClick={() => onMove(article.id, parentId, index - 1)}
            >
              <ArrowUp size={11} />
            </ActionButton>
            <ActionButton
              label={locale.navigationTree.moveDown}
              disabled={index === siblingCount - 1}
              onClick={() => onMove(article.id, parentId, index + 1)}
            >
              <ArrowDown size={11} />
            </ActionButton>
          </>
        ) : null}

        {onChangeParent ? (
          <ActionButton label={locale.navigationTree.changeParent} onClick={() => onChangeParent(article, parentId)}>
            <FolderInput size={11} />
          </ActionButton>
        ) : null}

        {onAddChild ? (
          <ActionButton label={locale.navigationTree.addChild} onClick={() => onAddChild(article.id, article.title)}>
            <Plus size={11} />
          </ActionButton>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <div className="mt-0.5 space-y-px">
          {article.children?.map((child, childIndex, children) => (
            <NavigationItem
              key={child.id}
              article={child}
              depth={depth + 1}
              parentId={article.id}
              index={childIndex}
              siblingCount={children.length}
              activeArticleId={activeArticleId}
              showArticleEditActions={showArticleEditActions}
              onNavigate={onNavigate}
              onAddChild={onAddChild}
              onMove={onMove}
              onChangeParent={onChangeParent}
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
  onMove,
  onChangeParent,
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
      {navigationTree?.map((article, index, roots) => (
        <NavigationItem
          key={article.id}
          article={article}
          depth={0}
          parentId={null}
          index={index}
          siblingCount={roots.length}
          activeArticleId={activeArticleId}
          showArticleEditActions={showArticleEditActions}
          onNavigate={onNavigate}
          onAddChild={onAddChild}
          onMove={onMove}
          onChangeParent={onChangeParent}
        />
      ))}
    </div>
  );
};

export default NavigationTree;
