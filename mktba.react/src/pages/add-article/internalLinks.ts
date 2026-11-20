import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { isReservedArticleSlug } from '../../shared/slug';
import type { ArticleStatus } from '../../shared/types/ApiTypes';
import type { EditorBlock } from './types';

/** An article the editor can link to: what the link picker lists and the link check knows. */
export type ArticleLinkTarget = {
  id: number;
  title: string;
  /** The titles from the root down to the article, joined with « / ». */
  path: string;
  slug: string;
  status: ArticleStatus;
};

/** Why an internal link in the text needs attention. */
export type InternalLinkProblem =
  /** No article the editor knows has this slug: mistyped, deleted, or an old slug (it redirects). */
  | 'missing'
  /** The article exists but is not Published: readers get 404 there. */
  | 'unpublished';

/** One internal link of a block that needs attention; each slug is reported once per block. */
export type BrokenInternalLink = {
  blockId: string;
  slug: string;
  problem: InternalLinkProblem;
};

/**
 * The article slug a link points at, or `null` when it is not a link to an article: an article
 * link is site-relative with a single path segment (`/{slug}`, query and fragment ignored) that is
 * not one of the site's other routes. Absolute URLs, `//host` links, anchors and paths like
 * `/search` or `/authors/x` are not article links.
 */
export const internalArticleSlug = (href: string): string | null => {
  if (!href.startsWith('/') || href.startsWith('//')) return null;

  const path = href.split(/[?#]/, 1)[0];
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.length !== 1) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
  return slug.includes('.') || isReservedArticleSlug(slug) ? null : slug;
};

type LinkNode = { type: string; url?: string; children?: LinkNode[] };

const collectLinkUrls = (node: LinkNode, urls: string[]) => {
  // Images are not links; a definition is the target of a reference link (`[text][ref]`).
  if ((node.type === 'link' || node.type === 'definition') && node.url) urls.push(node.url);
  node.children?.forEach((child) => collectLinkUrls(child, urls));
};

/** The article slugs a Markdown text links to, in order, each once. */
export const findInternalLinkSlugs = (markdown: string): string[] => {
  if (!markdown.includes('](') && !markdown.includes(']:')) return [];

  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as LinkNode;
  const urls: string[] = [];
  collectLinkUrls(tree, urls);
  return [...new Set(urls.map(internalArticleSlug).filter((slug): slug is string => slug !== null))];
};

const blockTexts = (block: EditorBlock): string[] =>
  block.kind === 'versioned' ? block.variants.map((variant) => variant.content) : [block.content];

/**
 * The internal links of the draft that point at no article the editor knows, or at one readers
 * cannot open. `articles` is what the signed-in user's navigation tree holds, so an article they
 * may not see counts as missing. A warning only: the editor saves such links as they are.
 */
export const findBrokenInternalLinks = (blocks: EditorBlock[], articles: ArticleLinkTarget[]): BrokenInternalLink[] => {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));

  return blocks.flatMap((block) => {
    const slugs = [...new Set(blockTexts(block).flatMap(findInternalLinkSlugs))];
    return slugs.flatMap((slug): BrokenInternalLink[] => {
      const article = bySlug.get(slug);
      if (!article) return [{ blockId: block.id, slug, problem: 'missing' }];
      if (article.status !== 'Published') return [{ blockId: block.id, slug, problem: 'unpublished' }];
      return [];
    });
  });
};

/** The articles whose title or path contains the query (case-insensitive), all for a blank query. */
export const filterLinkTargets = (articles: ArticleLinkTarget[], query: string): ArticleLinkTarget[] => {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter(
    (article) => article.title.toLowerCase().includes(q) || article.path.toLowerCase().includes(q) || article.slug.includes(q),
  );
};
