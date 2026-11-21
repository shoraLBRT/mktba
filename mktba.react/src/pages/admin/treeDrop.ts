import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import type { TreeDropPosition } from '../../components/navigationTree/NavigationRow';

/** A row of the tree where it stands: the article, its parent (null at the top level) and its index among the siblings. */
export type TreePlace = { articleId: number; parentId: number | null; index: number };

/** The article being dragged, its place and every id it may not be dropped on (itself and its subtree). */
export type DraggedArticle = TreePlace & { blockedIds: ReadonlySet<number> };

/** A move as `POST /articles/{id}/move` takes it: a null index appends under the parent. */
export type TreeMove = { articleId: number; parentId: number | null; index: number | null };

/** The article's id and the ids of all its descendants. */
export const collectSubtreeIds = (article: NavigationArticleDto): Set<number> => {
  const ids = new Set<number>();
  const visit = (node: NavigationArticleDto) => {
    ids.add(node.id);
    node.children?.forEach(visit);
  };
  visit(article);
  return ids;
};

/**
 * The upper quarter of a row puts the dragged article before it, the lower quarter after it, the
 * middle makes it the row's last child.
 */
export const dropPositionAt = (clientY: number, rect: { top: number; height: number }): TreeDropPosition => {
  const offset = clientY - rect.top;
  if (offset < rect.height / 4) return 'before';
  if (offset > (rect.height * 3) / 4) return 'after';
  return 'inside';
};

/**
 * The move a drop on `target` at `position` asks for, or null when the drop is refused (on the
 * article itself or inside its subtree, which would close a cycle) or would leave the article where
 * it is. Before / after place it among the target's siblings; the index is the one the API expects,
 * counted among the siblings without the moved article.
 */
export const resolveTreeDrop = (dragged: DraggedArticle, target: TreePlace, position: TreeDropPosition): TreeMove | null => {
  if (dragged.blockedIds.has(target.articleId)) return null;

  if (position === 'inside') {
    return { articleId: dragged.articleId, parentId: target.articleId, index: null };
  }

  const sameParent = dragged.parentId === target.parentId;
  let index = position === 'before' ? target.index : target.index + 1;
  if (sameParent && dragged.index < index) index -= 1;
  if (sameParent && index === dragged.index) return null;

  return { articleId: dragged.articleId, parentId: target.parentId, index };
};
