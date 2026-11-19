import type { NavigationArticleDto } from '../../shared/types/ApiTypes';

/** How many articles the home page's title search offers at once. */
export const TITLE_SEARCH_LIMIT = 8;

/** How many nested articles a section card names before «и ещё N». */
export const SECTION_PREVIEW_LIMIT = 5;

/**
 * The articles a reader can open whose title contains {@link term}, in tree order, at most
 * {@link limit}. Case-insensitive; a blank term finds nothing. Stubs with no content are skipped:
 * they have no page to open.
 */
export const findArticlesByTitle = (
  tree: NavigationArticleDto[] | undefined,
  term: string,
  limit: number = TITLE_SEARCH_LIMIT,
): NavigationArticleDto[] => {
  const needle = term.trim().toLowerCase();
  const found: NavigationArticleDto[] = [];
  if (!needle) {
    return found;
  }

  const walk = (nodes: NavigationArticleDto[]) => {
    for (const node of nodes) {
      if (found.length >= limit) {
        return;
      }
      if (node.hasContent && node.title.toLowerCase().includes(needle)) {
        found.push(node);
      }
      walk(node.children ?? []);
    }
  };

  walk(tree ?? []);
  return found;
};

/** A top-level article as a section of the home page: its first nested articles and how many more it has. */
export type HomeSection = {
  article: NavigationArticleDto;
  preview: NavigationArticleDto[];
  /** Direct children not named in {@link preview}. */
  moreCount: number;
};

/** The top level of the tree as home page sections, each with a preview of its direct children. */
export const homeSections = (
  tree: NavigationArticleDto[] | undefined,
  previewLimit: number = SECTION_PREVIEW_LIMIT,
): HomeSection[] =>
  (tree ?? []).map((article) => {
    const children = article.children ?? [];
    return {
      article,
      preview: children.slice(0, previewLimit),
      moreCount: Math.max(children.length - previewLimit, 0),
    };
  });
