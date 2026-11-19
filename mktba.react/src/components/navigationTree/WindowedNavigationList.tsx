import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { setSectionCollapsed, useCollapsedSections } from '../../shared/navigationTreeState';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { NavigationRow, type NavigationRowActions } from './NavigationRow';
import { flattenVisibleRows, isRowFocusable, rowRangeInView, WINDOWED_ROW_HEIGHT, type RowRange } from './windowing';

interface WindowedNavigationListProps extends NavigationRowActions {
  navigationTree?: NavigationArticleDto[];
  activeArticleId?: number;
}

const CLIPPING_OVERFLOW = new Set(['auto', 'scroll', 'hidden', 'clip']);

/**
 * The part of the viewport the list can be seen through: the window cut by every ancestor that
 * clips its content (the sidebar's scrolling `nav`, a scrolling page column). Vertical only.
 */
const visibleAreaOf = (list: HTMLElement): { top: number; bottom: number } => {
  let top = 0;
  let bottom = window.innerHeight;
  for (let element = list.parentElement; element; element = element.parentElement) {
    if (!CLIPPING_OVERFLOW.has(getComputedStyle(element).overflowY)) continue;
    const rect = element.getBoundingClientRect();
    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }
  return { top, bottom };
};

const articleIdOf = (target: EventTarget | null): number | null => {
  const item = target instanceof Element ? target.closest('li[data-tree-item]') : null;
  return item ? Number(item.getAttribute('data-tree-item')) : null;
};

/**
 * The navigation tree of a large site as one flat list that holds only the rows in view (plus a
 * few above and below), each in a fixed-height slot placed by its index. The hierarchy the nested
 * lists gave for free is spelled out on every `li`: `aria-level`, `aria-setsize`, `aria-posinset`.
 *
 * Two rows are rendered wherever they are, so nothing depends on what happens to be on screen: the
 * row that has the focus (scrolling away must not drop it) and the row of the current article.
 * The arrow keys work on the row model, not on the DOM: a row that is not rendered yet is rendered
 * first and focused then — the browser scrolls it into view as for any focused element.
 */
export const WindowedNavigationList: React.FC<WindowedNavigationListProps> = ({ navigationTree, activeArticleId, ...actions }) => {
  const { forceExpanded, showArticleEditActions } = actions;
  const collapsed = useCollapsedSections();
  const rows = useMemo(() => flattenVisibleRows(navigationTree, collapsed, forceExpanded), [navigationTree, collapsed, forceExpanded]);
  const indexById = useMemo(() => new Map(rows.map((row, index) => [row.article.id, index])), [rows]);
  const rowCount = rows.length;

  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusId = useRef<number | null>(null);
  const [range, setRange] = useState<RowRange>({ start: 0, end: 0 });
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const area = visibleAreaOf(list);
    const next = rowRangeInView(list.getBoundingClientRect().top - area.top, Math.max(area.bottom - area.top, 0), rowCount);
    setRange((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
  }, [rowCount]);

  useLayoutEffect(() => {
    measure();
    // Capturing: scroll events do not bubble, and the scroller is whichever ancestor scrolls.
    document.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('resize', measure);
    // A drawer or a column that appears or changes size without a scroll or a window resize.
    const container = listRef.current?.parentElement;
    const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (container) observer?.observe(container);
    return () => {
      document.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure]);

  const focusTargetOf = (articleId: number) =>
    listRef.current?.querySelector<HTMLElement>(`li[data-tree-item="${articleId}"] [data-tree-focus]`) ?? null;

  useLayoutEffect(() => {
    if (pendingFocusId.current === null) return;
    const target = focusTargetOf(pendingFocusId.current);
    if (!target) return;
    pendingFocusId.current = null;
    target.focus();
  });

  const focusRow = (index: number) => {
    const articleId = rows[index].article.id;
    const target = focusTargetOf(articleId);
    if (target) {
      target.focus();
      return;
    }
    pendingFocusId.current = articleId;
    setFocusedId(articleId);
  };

  const activeIndex = activeArticleId === undefined ? undefined : indexById.get(activeArticleId);
  const activeShown = activeIndex !== undefined;

  useEffect(() => {
    if (!activeShown) return;
    const row = listRef.current?.querySelector(`li[data-tree-item="${activeArticleId}"]`);
    // The drawer of a phone is off screen while closed (`inert`): scrolling there helps nobody.
    if (row && !row.closest('[inert]')) row.scrollIntoView?.({ block: 'nearest' });
  }, [activeArticleId, activeShown]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const articleId = articleIdOf(event.target);
    const index = articleId === null ? undefined : indexById.get(articleId);
    if (articleId === null || index === undefined) return;

    const row = rows[index];
    const focusable = (candidate: number) => isRowFocusable(rows[candidate].article, showArticleEditActions, forceExpanded);
    /** The first focusable row from `from` on, going by `step`, while `inside` holds. */
    const seek = (from: number, step: 1 | -1, inside: (candidate: number) => boolean = () => true) => {
      for (let candidate = from; candidate >= 0 && candidate < rowCount && inside(candidate); candidate += step) {
        if (focusable(candidate)) return candidate;
      }
      return -1;
    };
    const hasToggle = (row.article.children?.length ?? 0) > 0 && !forceExpanded;

    let target = -1;
    switch (event.key) {
      case 'ArrowDown':
        target = seek(index + 1, 1);
        break;
      case 'ArrowUp':
        target = seek(index - 1, -1);
        break;
      case 'Home':
        target = seek(0, 1);
        break;
      case 'End':
        target = seek(rowCount - 1, -1);
        break;
      case 'ArrowRight':
        if (hasToggle && !row.expanded) setSectionCollapsed(articleId, false);
        else target = seek(index + 1, 1, (candidate) => rows[candidate].depth > row.depth);
        break;
      case 'ArrowLeft': {
        if (hasToggle && row.expanded) setSectionCollapsed(articleId, true);
        else {
          const parentIndex = row.parentId === null ? undefined : indexById.get(row.parentId);
          if (parentIndex !== undefined && focusable(parentIndex)) target = parentIndex;
        }
        break;
      }
      default:
        return;
    }

    event.preventDefault();
    if (target >= 0) focusRow(target);
  };

  const end = Math.min(range.end, rowCount);
  const focusedIndex = focusedId === null ? undefined : indexById.get(focusedId);
  const rendered = [focusedIndex, activeIndex]
    .filter((index): index is number => index !== undefined && (index < range.start || index >= end))
    .concat(Array.from({ length: Math.max(end - range.start, 0) }, (_, offset) => range.start + offset));
  const renderedInOrder = [...new Set(rendered)].sort((left, right) => left - right);

  return (
    <ul
      ref={listRef}
      data-tree-windowed=""
      className="relative m-0 list-none p-0"
      style={{ height: rowCount * WINDOWED_ROW_HEIGHT }}
      onKeyDown={handleKeyDown}
      onFocus={(event) => setFocusedId(articleIdOf(event.target))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
      }}
    >
      {renderedInOrder.map((index) => {
        const row = rows[index];
        return (
          <li
            key={row.article.id}
            data-tree-item={row.article.id}
            aria-level={row.depth + 1}
            aria-setsize={row.siblingCount}
            aria-posinset={row.index + 1}
            className="absolute inset-x-0"
            style={{ top: index * WINDOWED_ROW_HEIGHT, height: WINDOWED_ROW_HEIGHT }}
          >
            <NavigationRow
              article={row.article}
              depth={row.depth}
              parentId={row.parentId}
              index={row.index}
              siblingCount={row.siblingCount}
              isActive={row.article.id === activeArticleId}
              expanded={row.expanded}
              {...actions}
            />
          </li>
        );
      })}
    </ul>
  );
};
