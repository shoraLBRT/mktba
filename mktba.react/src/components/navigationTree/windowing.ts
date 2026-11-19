import type { NavigationArticleDto } from '../../shared/types/ApiTypes';

/**
 * A tree with more articles than this is windowed once the page is hydrated: only the rows in view
 * are in the DOM. Up to it the nested list costs next to nothing and stays as it is.
 */
export const NAVIGATION_TREE_WINDOWING_THRESHOLD = 300;

/** Height of a windowed row's slot: the 28px line plus the 1px gap the nested list has. */
export const WINDOWED_ROW_HEIGHT = 29;

/** Rows rendered above and below the visible ones, so a scroll does not show a gap. */
export const WINDOW_OVERSCAN_ROWS = 10;

export interface FlatTreeRow {
  article: NavigationArticleDto;
  /** 0 for a root. */
  depth: number;
  parentId: number | null;
  /** 0-based position among the siblings. */
  index: number;
  siblingCount: number;
  expanded: boolean;
}

/** Whether the tree holds more than `limit` articles; stops counting as soon as it knows. */
export const hasMoreArticlesThan = (tree: NavigationArticleDto[] | undefined, limit: number): boolean => {
  let seen = 0;
  const walk = (articles: NavigationArticleDto[]): boolean =>
    articles.some((article) => {
      seen += 1;
      return seen > limit || walk(article.children ?? []);
    });
  return walk(tree ?? []);
};

/** The rows on screen, top to bottom: the children of a collapsed section are left out. */
export const flattenVisibleRows = (
  tree: NavigationArticleDto[] | undefined,
  collapsed: ReadonlySet<number>,
  forceExpanded: boolean,
): FlatTreeRow[] => {
  const rows: FlatTreeRow[] = [];
  const walk = (articles: NavigationArticleDto[], depth: number, parentId: number | null) => {
    articles.forEach((article, index) => {
      const expanded = forceExpanded || !collapsed.has(article.id);
      rows.push({ article, depth, parentId, index, siblingCount: articles.length, expanded });
      if (expanded && article.children?.length) walk(article.children, depth + 1, article.id);
    });
  };
  walk(tree ?? [], 0, null);
  return rows;
};

export interface RowRange {
  /** First rendered row. */
  start: number;
  /** One past the last rendered row. */
  end: number;
}

/**
 * The rows to render for a list whose top edge is `listTop` px below the top of the visible area
 * (negative once it has scrolled past), in a visible area `viewHeight` px high.
 */
export const rowRangeInView = (listTop: number, viewHeight: number, rowCount: number): RowRange => {
  const first = Math.floor(-listTop / WINDOWED_ROW_HEIGHT) - WINDOW_OVERSCAN_ROWS;
  const last = Math.ceil((viewHeight - listTop) / WINDOWED_ROW_HEIGHT) + WINDOW_OVERSCAN_ROWS;
  const start = Math.min(Math.max(first, 0), rowCount);
  return { start, end: Math.min(Math.max(last, start), rowCount) };
};

/**
 * An article without content is a stub (a Published section heading, say): not a link for readers,
 * but whoever may edit it must be able to open its editor to fill it in (see docs/backlog.md, A1).
 * The API says per article whether the caller may edit it (U-02).
 */
export const opensEditorOf = (article: NavigationArticleDto, showArticleEditActions: boolean): boolean =>
  showArticleEditActions && article.canEdit;

/** Whether the arrow keys can land on the row: it has a link, or at least a toggle. */
export const isRowFocusable = (article: NavigationArticleDto, showArticleEditActions: boolean, forceExpanded: boolean): boolean =>
  article.hasContent || opensEditorOf(article, showArticleEditActions) || ((article.children?.length ?? 0) > 0 && !forceExpanded);
