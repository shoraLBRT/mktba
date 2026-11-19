import type { NavigationArticleDto } from './types/ApiTypes';

/** An article that can become the new parent of another one, with its depth in the tree for indenting. */
export type ParentOption = {
  id: number;
  title: string;
  depth: number;
};

/**
 * Every article in tree order that may become the parent of {@link articleId}: all of them except
 * the article itself and its descendants, which would close a cycle (the API answers
 * `article_move_cycle` for those).
 */
export const collectValidParents = (
  tree: NavigationArticleDto[] | undefined,
  articleId: number,
): ParentOption[] => {
  const options: ParentOption[] = [];

  const walk = (nodes: NavigationArticleDto[], depth: number) => {
    for (const node of nodes) {
      if (node.id === articleId) continue;
      options.push({ id: node.id, title: node.title, depth });
      walk(node.children ?? [], depth + 1);
    }
  };

  walk(tree ?? [], 0);
  return options;
};

/**
 * The chain of articles from a root of the tree down to {@link articleId}, the article itself
 * last; empty when the tree does not hold it. A stub without content is found like any other.
 */
export const findArticlePath = (
  tree: NavigationArticleDto[] | undefined,
  articleId: number,
): NavigationArticleDto[] => {
  for (const node of tree ?? []) {
    if (node.id === articleId) {
      return [node];
    }

    const nested = findArticlePath(node.children ?? [], articleId);
    if (nested.length > 0) {
      return [node, ...nested];
    }
  }

  return [];
};

/** The neighbours of an article in reading order; a side with no article is `null`. */
export type AdjacentArticles = {
  previous: NavigationArticleDto | null;
  next: NavigationArticleDto | null;
};

/**
 * The articles before and after {@link articleId} in the tree read top to bottom (a parent, then
 * its children, then the parent's next sibling). Stubs are stepped over: they have no page worth
 * opening, so the neighbours are the nearest articles with content. Both are `null` when the tree
 * does not hold the article.
 */
export const findAdjacentArticles = (
  tree: NavigationArticleDto[] | undefined,
  articleId: number,
): AdjacentArticles => {
  let previous: NavigationArticleDto | null = null;
  let next: NavigationArticleDto | null = null;
  let found = false;

  const walk = (nodes: NavigationArticleDto[]): boolean => {
    for (const node of nodes) {
      if (node.id === articleId) {
        found = true;
      } else if (node.hasContent) {
        if (found) {
          next = node;
          return true;
        }
        previous = node;
      }

      if (walk(node.children ?? [])) {
        return true;
      }
    }

    return false;
  };

  walk(tree ?? []);
  return found ? { previous, next } : { previous: null, next: null };
};
