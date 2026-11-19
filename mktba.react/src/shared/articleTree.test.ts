import { describe, expect, it } from 'vitest';
import { collectValidParents, findAdjacentArticles, findArticlePath } from './articleTree';
import type { NavigationArticleDto } from './types/ApiTypes';

const node = (id: number, title: string, children: NavigationArticleDto[] = [], hasContent = true) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent, children }) as unknown as NavigationArticleDto;

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

describe('findArticlePath', () => {
  it('given a nested article, when looked up, then returns its ancestors from the root and the article last', () => {
    expect(findArticlePath(tree, 3).map((article) => article.title)).toEqual(['Намаз', 'Условия', 'Омовение']);
  });

  it('given a stub without content under a stub section, when looked up, then the path is found all the same', () => {
    const stubs = [node(1, 'Раздел', [node(2, 'Заглушка', [], false)], false)];

    expect(findArticlePath(stubs, 2).map((article) => article.id)).toEqual([1, 2]);
  });

  it('given an article the tree does not hold or no tree yet, when looked up, then the path is empty', () => {
    expect(findArticlePath(tree, 99)).toEqual([]);
    expect(findArticlePath(undefined, 1)).toEqual([]);
  });
});

describe('findAdjacentArticles', () => {
  const ids = (articleId: number, source = tree) => {
    const { previous, next } = findAdjacentArticles(source, articleId);
    return [previous?.id ?? null, next?.id ?? null];
  };

  it('given an article with children, when looking, then the next one is its first child', () => {
    expect(ids(2)).toEqual([1, 3]);
  });

  it('given the last article of a branch, when looking, then the next one follows the branch', () => {
    expect(ids(3)).toEqual([2, 4]);
    expect(ids(4)).toEqual([3, 5]);
  });

  it('given the first and the last article of the tree, when looking, then that side is empty', () => {
    expect(ids(1)).toEqual([null, 2]);
    expect(ids(5)).toEqual([4, null]);
  });

  it('given stubs next to the article, when looking, then they are stepped over', () => {
    const withStubs = [
      node(1, 'Намаз', [node(2, 'Условия', [node(3, 'Омовение')], false), node(4, 'Время')]),
      node(5, 'Пост', [], false),
    ];

    expect(ids(1, withStubs)).toEqual([null, 3]);
    expect(ids(3, withStubs)).toEqual([1, 4]);
    expect(ids(4, withStubs)).toEqual([3, null]);
  });

  it('given a stub, when looking, then its neighbours are the nearest articles with content', () => {
    const withStub = [node(1, 'Намаз'), node(2, 'Пост', [node(3, 'Сухур')], false), node(4, 'Закят')];

    expect(ids(2, withStub)).toEqual([1, 3]);
  });

  it('given an article the tree does not hold or no tree, when looking, then both sides are empty', () => {
    expect(ids(99)).toEqual([null, null]);
    expect(findAdjacentArticles(undefined, 1)).toEqual({ previous: null, next: null });
  });
});
