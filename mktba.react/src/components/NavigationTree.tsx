import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router';
import { findArticlePath } from '../shared/articleTree';
import { expandSections, setSectionCollapsed, useSectionCollapsed } from '../shared/navigationTreeState';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';
import { useHydrated } from '../shared/useHydrated';
import { NavigationRow, type NavigationRowActions } from './navigationTree/NavigationRow';
import { WindowedNavigationList } from './navigationTree/WindowedNavigationList';
import { hasMoreArticlesThan, NAVIGATION_TREE_WINDOWING_THRESHOLD } from './navigationTree/windowing';

interface NavigationTreeProps extends Partial<NavigationRowActions> {
  navigationTree?: NavigationArticleDto[];
}

type NavigationItemProps = NavigationRowActions & {
  article: NavigationArticleDto;
  depth: number;
  parentId: number | null;
  index: number;
  siblingCount: number;
  activeArticleId?: number;
};

const NavigationItem: React.FC<NavigationItemProps> = ({ article, depth, parentId, index, siblingCount, activeArticleId, ...actions }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = (article.children?.length ?? 0) > 0;
  const collapsed = useSectionCollapsed(article.id);
  const expanded = actions.forceExpanded || !collapsed;
  const isActive = article.id === activeArticleId;

  useEffect(() => {
    // The drawer of a phone is off screen while closed (`inert`): scrolling there helps nobody.
    if (isActive && !rowRef.current?.closest('[inert]')) {
      rowRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [isActive]);

  return (
    <li data-tree-item={article.id} data-expanded={hasChildren ? expanded : undefined}>
      <NavigationRow
        article={article}
        depth={depth}
        parentId={parentId}
        index={index}
        siblingCount={siblingCount}
        isActive={isActive}
        expanded={expanded}
        skipOffscreenPaint
        rowRef={rowRef}
        {...actions}
      />

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
              {...actions}
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

/**
 * The article hierarchy of the sidebar and of the admin tree. The server and the hydrating render
 * always produce nested lists with every link (crawlers, no hydration mismatch). After hydration a
 * tree above `NAVIGATION_TREE_WINDOWING_THRESHOLD` articles switches to `WindowedNavigationList`,
 * which keeps only the rows in view in the DOM; a smaller tree stays nested.
 */
const NavigationTree: React.FC<NavigationTreeProps> = ({
  navigationTree,
  showArticleEditActions = false,
  forceExpanded = false,
  onNavigate,
  onAddChild,
  onMove,
  onChangeParent,
  onRename,
  dragAndDrop,
}) => {
  const location = useLocation();
  const hydrated = useHydrated();
  const windowed = useMemo(
    () => hydrated && hasMoreArticlesThan(navigationTree, NAVIGATION_TREE_WINDOWING_THRESHOLD),
    [hydrated, navigationTree],
  );

  const activeArticleId = useMemo(() => {
    // An article's `/{slug}`, or an old `/article/{slug-or-id}` while it is being redirected.
    const readMatch = location.pathname.match(/^\/(?:article\/)?([^/]+)$/);
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

  const actions: NavigationRowActions = { showArticleEditActions, forceExpanded, onNavigate, onAddChild, onMove, onChangeParent, onRename, dragAndDrop };

  if (windowed) {
    return <WindowedNavigationList navigationTree={navigationTree} activeArticleId={activeArticleId} {...actions} />;
  }

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
          {...actions}
        />
      ))}
    </ul>
  );
};

export default NavigationTree;
