import { useMemo, useState, type DragEvent } from 'react';
import type { TreeDropPosition, TreeRowDragAndDrop } from '../../components/navigationTree/NavigationRow';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { collectSubtreeIds, dropPositionAt, resolveTreeDrop, type DraggedArticle, type TreeMove } from './treeDrop';

/** The drag data type of a tree row; nothing else on the page takes it. */
const ARTICLE_DRAG_TYPE = 'application/x-mktba-article';

type DropTarget = { articleId: number; position: TreeDropPosition };

/**
 * Drag and drop of the admin tree's rows (native HTML drag and drop, no library, like the editor's
 * blocks): a row is dragged by its handle and dropped on another row — its upper quarter before it,
 * its lower quarter after it, the middle as its last child. A row of the dragged article's own
 * subtree takes no drop, so a move can never close a cycle (the API refuses one anyway). The
 * keyboard way is the rows' move buttons and the parent picker. Lives in the admin chunk: the
 * public tree only renders what `TreeRowDragAndDrop` hands it.
 */
export const useTreeDragAndDrop = (onMove: (move: TreeMove) => void): TreeRowDragAndDrop => {
  const [dragged, setDragged] = useState<DraggedArticle | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  return useMemo<TreeRowDragAndDrop>(() => {
    const reset = () => {
      setDragged(null);
      setDropTarget(null);
    };

    const positionOf = (event: DragEvent<HTMLElement>) =>
      dropPositionAt(event.clientY, event.currentTarget.getBoundingClientRect());

    return {
      draggedArticleId: dragged?.articleId ?? null,
      dropPositionOf: (articleId) => (dropTarget?.articleId === articleId ? dropTarget.position : null),
      handleProps: (article: NavigationArticleDto, parentId, index) => ({
        draggable: true,
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(ARTICLE_DRAG_TYPE, String(article.id));
          const row = event.currentTarget.parentElement;
          if (row) event.dataTransfer.setDragImage(row, 16, 12);
          setDragged({ articleId: article.id, parentId, index, blockedIds: collectSubtreeIds(article) });
        },
        onDragEnd: reset,
      }),
      rowProps: (article, parentId, index) => {
        const target = { articleId: article.id, parentId, index };
        return {
          onDragOver: (event) => {
            if (!dragged) return;
            const position = positionOf(event);
            if (!resolveTreeDrop(dragged, target, position)) {
              if (dropTarget?.articleId === article.id) setDropTarget(null);
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (dropTarget?.articleId !== article.id || dropTarget.position !== position) {
              setDropTarget({ articleId: article.id, position });
            }
          },
          onDragLeave: (event) => {
            if (dropTarget?.articleId === article.id && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropTarget(null);
            }
          },
          onDrop: (event) => {
            if (!dragged) return;
            event.preventDefault();
            const move = resolveTreeDrop(dragged, target, positionOf(event));
            reset();
            if (move) onMove(move);
          },
        };
      },
    };
  }, [dragged, dropTarget, onMove]);
};
