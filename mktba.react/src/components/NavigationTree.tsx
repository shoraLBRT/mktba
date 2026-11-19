import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderInput, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useLocale } from '../localization/hooks';
import { ArticleStatusBadge } from './article/ArticleStatusBadge';
import { findArticlePath } from '../shared/articleTree';
import { expandSections, setSectionCollapsed, useSectionCollapsed } from '../shared/navigationTreeState';
import { articleHref } from '../shared/slug';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';

interface NavigationTreeProps {
  navigationTree?: NavigationArticleDto[];
  showArticleEditActions?: boolean;
  onNavigate?: () => void;
  /** Shows every section expanded whatever the saved state, without the toggles (a filtered tree). */
  forceExpanded?: boolean;
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
  forceExpanded: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
  onMove?: NavigationTreeProps['onMove'];
  onChangeParent?: NavigationTreeProps['onChangeParent'];
};

// Rows are one line high (28px), so the browser may skip laying out and painting the ones off
// screen (`content-visibility`) while they stay in the DOM: links, find-in-page and focus all work.
const rowClass =
  'group flex items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_28px]';

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
  forceExpanded,
  onNavigate,
  onAddChild,
  onMove,
  onChangeParent,
}) => {
  const locale = useLocale();
  const rowRef = useRef<HTMLDivElement>(null);
  const childCount = article.children?.length ?? 0;
  const hasChildren = childCount > 0;
  const collapsed = useSectionCollapsed(article.id);
  const expanded = forceExpanded || !collapsed;
  const isActive = article.id === activeArticleId;

  useEffect(() => {
    // The drawer of a phone is off screen while closed (`inert`): scrolling there helps nobody.
    if (isActive && !rowRef.current?.closest('[inert]')) {
      rowRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isActive]);
  // An article without content is a stub (a Published section heading, say): not a link for
  // readers, but whoever may edit it must be able to open its editor to fill it in (see
  // docs/backlog.md, A1). The API says per article whether the caller may edit it (U-02).
  const opensEditor = showArticleEditActions && article.canEdit;
  const isClickable = article.hasContent || opensEditor;

  return (
    <li data-tree-item={article.id} data-expanded={hasChildren ? expanded : undefined}>
      <div
        ref={rowRef}
        className={[
          rowClass,
          isActive
            ? 'bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]'
            : 'text-[var(--color-ink-default)] hover:bg-[rgba(255,255,255,0.75)] hover:text-[var(--color-ink-strong)]',
        ].join(' ')}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        {hasChildren && !forceExpanded ? (
          <button
            type="button"
            onClick={() => setSectionCollapsed(article.id, expanded)}
            aria-expanded={expanded}
            data-tree-focus={isClickable ? undefined : ''}
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
            aria-current={isActive ? 'page' : undefined}
            data-tree-focus=""
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

        {hasChildren ? (
          <span className="shrink-0 px-1 text-[10px] leading-5 tabular-nums text-[var(--color-ink-subtle)]">
            <span aria-hidden="true">{childCount}</span>
            <span className="sr-only">{locale.navigationTree.childCount.replace('{count}', String(childCount))}</span>
          </span>
        ) : null}

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
        <ul className="m-0 mt-0.5 list-none space-y-px p-0">
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
              forceExpanded={forceExpanded}
              onNavigate={onNavigate}
              onAddChild={onAddChild}
              onMove={onMove}
              onChangeParent={onChangeParent}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

const focusTargetOf = (item: Element): HTMLElement | null =>
  item.firstElementChild?.querySelector<HTMLElement>('[data-tree-focus]') ?? null;

/**
 * Arrow keys of the WAI-ARIA tree pattern over the rows that are on screen: up/down to the
 * neighbouring row, right to expand a section or step into it, left to collapse it or step out to
 * its parent, Home/End to the ends. Tab still walks every link and button: the tree keeps the
 * native list, link and disclosure-button semantics (see CLAUDE.md, "Navigation tree").
 */
const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLUListElement>, forceExpanded: boolean) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const item = (event.target as HTMLElement).closest('li[data-tree-item]');
  if (!item) return;

  const articleId = Number(item.getAttribute('data-tree-item'));
  const expandedState = forceExpanded ? null : item.getAttribute('data-expanded');
  const items = Array.from(event.currentTarget.querySelectorAll('li[data-tree-item]'));
  const index = items.indexOf(item);
  const firstTarget = (candidates: Element[]) => candidates.map(focusTargetOf).find((target) => target !== null) ?? null;

  let target: HTMLElement | null = null;
  switch (event.key) {
    case 'ArrowDown':
      target = firstTarget(items.slice(index + 1));
      break;
    case 'ArrowUp':
      target = firstTarget(items.slice(0, index).reverse());
      break;
    case 'Home':
      target = firstTarget(items);
      break;
    case 'End':
      target = firstTarget(items.slice().reverse());
      break;
    case 'ArrowRight':
      if (expandedState === 'false') setSectionCollapsed(articleId, false);
      else target = firstTarget(Array.from(item.querySelectorAll('li[data-tree-item]')));
      break;
    case 'ArrowLeft': {
      if (expandedState === 'true') setSectionCollapsed(articleId, true);
      else {
        const parent = item.parentElement?.closest('li[data-tree-item]');
        target = parent ? focusTargetOf(parent) : null;
      }
      break;
    }
    default:
      return;
  }

  event.preventDefault();
  target?.focus();
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
  forceExpanded = false,
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

  useEffect(() => {
    if (activeArticleId === undefined) return;
    const ancestors = findArticlePath(navigationTree, activeArticleId).slice(0, -1);
    expandSections(ancestors.map((ancestor) => ancestor.id));
  }, [activeArticleId, navigationTree]);

  return (
    <ul className="m-0 list-none space-y-px p-0" onKeyDown={(event) => handleTreeKeyDown(event, forceExpanded)}>
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
          forceExpanded={forceExpanded}
          onNavigate={onNavigate}
          onAddChild={onAddChild}
          onMove={onMove}
          onChangeParent={onChangeParent}
        />
      ))}
    </ul>
  );
};

export default NavigationTree;
