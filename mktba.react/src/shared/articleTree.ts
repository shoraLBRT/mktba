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
