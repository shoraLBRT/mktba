import { describe, expect, it } from 'vitest';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { collectSubtreeIds, dropPositionAt, resolveTreeDrop, type DraggedArticle } from './treeDrop';

const node = (id: number, children: NavigationArticleDto[] = []) => ({ id, children }) as unknown as NavigationArticleDto;

// Roots: 1 (children 2, 3, 4 with 5 under 3), 6.
const dragged = (articleId: number, parentId: number | null, index: number, blocked: number[] = [articleId]): DraggedArticle => ({
  articleId,
  parentId,
  index,
  blockedIds: new Set(blocked),
});

describe('dropPositionAt', () => {
  const rect = { top: 100, height: 40 };

  it('given the upper quarter, the middle and the lower quarter, then answers before, inside and after', () => {
    expect(dropPositionAt(105, rect)).toBe('before');
    expect(dropPositionAt(120, rect)).toBe('inside');
    expect(dropPositionAt(135, rect)).toBe('after');
  });
});

describe('collectSubtreeIds', () => {
  it('given a section with nested children, then holds the section and every descendant', () => {
    expect([...collectSubtreeIds(node(1, [node(2), node(3, [node(5)])]))].sort()).toEqual([1, 2, 3, 5]);
  });
});

describe('resolveTreeDrop', () => {
  it('given a sibling dragged down after a later one, then counts the index without the moved article', () => {
    expect(resolveTreeDrop(dragged(2, 1, 0), { articleId: 4, parentId: 1, index: 2 }, 'after')).toEqual({
      articleId: 2,
      parentId: 1,
      index: 2,
    });
    expect(resolveTreeDrop(dragged(2, 1, 0), { articleId: 4, parentId: 1, index: 2 }, 'before')).toEqual({
      articleId: 2,
      parentId: 1,
      index: 1,
    });
  });

  it('given a sibling dragged up before an earlier one, then takes that one\'s index', () => {
    expect(resolveTreeDrop(dragged(4, 1, 2), { articleId: 2, parentId: 1, index: 0 }, 'before')).toEqual({
      articleId: 4,
      parentId: 1,
      index: 0,
    });
  });

  it('given a drop that leaves the article where it is, then asks for no move', () => {
    expect(resolveTreeDrop(dragged(3, 1, 1), { articleId: 2, parentId: 1, index: 0 }, 'after')).toBeNull();
    expect(resolveTreeDrop(dragged(3, 1, 1), { articleId: 4, parentId: 1, index: 2 }, 'before')).toBeNull();
  });

  it('given another section, when dropped beside or inside a row there, then moves under that parent', () => {
    expect(resolveTreeDrop(dragged(5, 3, 0), { articleId: 6, parentId: null, index: 1 }, 'before')).toEqual({
      articleId: 5,
      parentId: null,
      index: 1,
    });
    expect(resolveTreeDrop(dragged(5, 3, 0), { articleId: 6, parentId: null, index: 1 }, 'inside')).toEqual({
      articleId: 5,
      parentId: 6,
      index: null,
    });
  });

  it('given the article itself or a row of its subtree, then refuses the drop in every position', () => {
    const section = dragged(1, null, 0, [1, 2, 3, 4, 5]);

    for (const position of ['before', 'inside', 'after'] as const) {
      expect(resolveTreeDrop(section, { articleId: 1, parentId: null, index: 0 }, position)).toBeNull();
      expect(resolveTreeDrop(section, { articleId: 5, parentId: 3, index: 0 }, position)).toBeNull();
    }
  });
});
