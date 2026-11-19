import { describe, expect, it } from 'vitest';
import { collectValidParents } from './articleTree';
import type { NavigationArticleDto } from './types/ApiTypes';

const node = (id: number, title: string, children: NavigationArticleDto[] = []) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent: true, children }) as unknown as NavigationArticleDto;

const tree = [
  node(1, 'Намаз', [node(2, 'Условия', [node(3, 'Омовение')]), node(4, 'Время')]),
  node(5, 'Пост'),
];

describe('collectValidParents', () => {
  it('given an article with descendants, when collecting, then leaves out the article and its subtree', () => {
    expect(collectValidParents(tree, 2).map((option) => option.id)).toEqual([1, 4, 5]);
  });

  it('given a leaf, when collecting, then lists every other article in tree order with its depth', () => {
    expect(collectValidParents(tree, 5)).toEqual([
      { id: 1, title: 'Намаз', depth: 0 },
      { id: 2, title: 'Условия', depth: 1 },
      { id: 3, title: 'Омовение', depth: 2 },
      { id: 4, title: 'Время', depth: 1 },
    ]);
  });

  it('given no tree yet, when collecting, then returns nothing', () => {
    expect(collectValidParents(undefined, 1)).toEqual([]);
  });
});
