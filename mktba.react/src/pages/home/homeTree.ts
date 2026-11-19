import type { NavigationArticleDto } from '../../shared/types/ApiTypes';

/** How many nested articles a section card names before «и ещё N». */
export const SECTION_PREVIEW_LIMIT = 5;

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
