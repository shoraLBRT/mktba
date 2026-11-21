import React from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderInput, GripVertical, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale } from '../../localization/hooks';
import { ArticleStatusBadge } from '../article/ArticleStatusBadge';
import { setSectionCollapsed } from '../../shared/navigationTreeState';
import { articleHref } from '../../shared/slug';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { opensEditorOf } from './windowing';

/** What the tree hands to every row: the same in the nested and in the windowed mode. */
export interface NavigationRowActions {
  showArticleEditActions: boolean;
  /** Shows every section expanded whatever the saved state, without the toggles (a filtered tree). */
  forceExpanded: boolean;
  onNavigate?: () => void;
  onAddChild?: (parentId: number, parentTitle: string) => void;
  /** Admin reorder: puts the article at a 0-based index among the children of parentId (null: roots). */
  onMove?: (articleId: number, parentId: number | null, index: number) => void;
  /** Admin: opens the parent picker for the article. */
  onChangeParent?: (article: NavigationArticleDto, parentId: number | null) => void;
  /** Admin: opens the rename dialog for the article. */
  onRename?: (article: NavigationArticleDto, parentId: number | null) => void;
  /**
   * Admin drag and drop of the rows (A-03). The tree only spreads what it hands over; the logic
   * lives in the admin chunk (`pages/admin/useTreeDragAndDrop.ts`), out of the public bundle.
   */
  dragAndDrop?: TreeRowDragAndDrop;
}

/** Where a row dropped on another one goes: before it, after it, or in it as its last child. */
export type TreeDropPosition = 'before' | 'inside' | 'after';

export interface TreeRowDragAndDrop {
  draggedArticleId: number | null;
  /** The drop the pointer is over on this row, for its marker; null when none. */
  dropPositionOf: (articleId: number) => TreeDropPosition | null;
  /** Spread on the row's drag handle. */
  handleProps: (article: NavigationArticleDto, parentId: number | null, index: number) => React.HTMLAttributes<HTMLElement>;
  /** Spread on the row itself, the drop target. */
  rowProps: (article: NavigationArticleDto, parentId: number | null, index: number) => React.HTMLAttributes<HTMLDivElement>;
}

const dropMarkerClass: Record<TreeDropPosition, string> = {
  before: 'shadow-[inset_0_2px_0_var(--color-brand-forest)]',
  after: 'shadow-[inset_0_-2px_0_var(--color-brand-forest)]',
  inside: 'ring-2 ring-inset ring-[var(--color-brand-forest)]',
};

export interface NavigationRowProps extends NavigationRowActions {
  article: NavigationArticleDto;
  depth: number;
  parentId: number | null;
  /** 0-based position among the siblings. */
  index: number;
  siblingCount: number;
  isActive: boolean;
  expanded: boolean;
  /**
   * Rows of the nested tree are `content-visibility: auto` with a fixed intrinsic height (28px, one
   * line): until the page is hydrated a large tree is all in the DOM, and the browser may skip
   * laying out and painting what is off screen. A windowed row is on screen by definition.
   */
  skipOffscreenPaint?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}

const rowClass = 'group flex items-center gap-0.5 rounded-lg px-1.5 py-1 transition-colors';

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

/** One line of the navigation tree: toggle, title, child counter and, in the admin, the actions. */
export const NavigationRow: React.FC<NavigationRowProps> = React.memo(
  ({
    article,
    depth,
    parentId,
    index,
    siblingCount,
    isActive,
    expanded,
    skipOffscreenPaint = false,
    rowRef,
    showArticleEditActions,
    forceExpanded,
    onNavigate,
    onAddChild,
    onMove,
    onChangeParent,
    onRename,
    dragAndDrop,
  }) => {
    const locale = useLocale();
    const childCount = article.children?.length ?? 0;
    const hasChildren = childCount > 0;
    const opensEditor = opensEditorOf(article, showArticleEditActions);
    const isClickable = article.hasContent || opensEditor;
    const dropPosition = dragAndDrop?.dropPositionOf(article.id) ?? null;

    return (
      <div
        ref={rowRef}
        {...dragAndDrop?.rowProps(article, parentId, index)}
        data-drop={dropPosition ?? undefined}
        className={[
          rowClass,
          skipOffscreenPaint ? '[content-visibility:auto] [contain-intrinsic-size:auto_28px]' : '',
          isActive
            ? 'bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]'
            : 'text-[var(--color-ink-default)] hover:bg-[rgba(255,255,255,0.75)] hover:text-[var(--color-ink-strong)]',
          dropPosition ? dropMarkerClass[dropPosition] : '',
          dragAndDrop?.draggedArticleId === article.id ? 'opacity-50' : '',
        ].join(' ')}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
      >
        {dragAndDrop ? (
          // Pointer only: the keyboard moves a row with its move buttons and the parent picker.
          <span
            {...dragAndDrop.handleProps(article, parentId, index)}
            aria-hidden="true"
            data-testid="tree-drag-handle"
            title={locale.navigationTree.dragHandle}
            className="flex h-[18px] w-3 shrink-0 cursor-grab items-center justify-center text-[var(--color-ink-subtle)] opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
          >
            <GripVertical size={11} />
          </span>
        ) : null}

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

        {onRename ? (
          <ActionButton label={locale.navigationTree.rename} onClick={() => onRename(article, parentId)}>
            <Pencil size={11} />
          </ActionButton>
        ) : null}

        {onAddChild ? (
          <ActionButton label={locale.navigationTree.addChild} onClick={() => onAddChild(article.id, article.title)}>
            <Plus size={11} />
          </ActionButton>
        ) : null}
      </div>
    );
  },
);
NavigationRow.displayName = 'NavigationRow';
