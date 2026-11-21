/**
 * The search snippet the publication panel previews (E-12, #82): the effective title and
 * description of the draft, worked out as the API's `ArticleSeo.Resolve` does for `meta` on
 * `ArticleContentDto` — SEO title → title; SEO description → summary → an excerpt of the first
 * paragraph's default opinion. Kept here, not in `src/shared/seo.ts`, so the article page's bundle
 * does not carry it.
 */
import { SEO_DESCRIPTION_MAX_LENGTH } from '../../shared/seo';
import { buildParagraphCreateDtosFromBlocks } from './draftHelpers';
import type { ArticleDraft } from './articleDraft';

/**
 * Plain text of Markdown/HTML, whitespace collapsed, cut on a word boundary to 160 characters
 * with an ellipsis; null when nothing is left. Mirrors `ArticleSeo.Excerpt`.
 */
export const seoExcerpt = (markdown: string | null | undefined): string | null => {
  if (!markdown || !markdown.trim()) return null;
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return null;
  if (text.length <= SEO_DESCRIPTION_MAX_LENGTH) return text;
  let cut = text.slice(0, SEO_DESCRIPTION_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > SEO_DESCRIPTION_MAX_LENGTH / 2) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[ ,;:.\-—]+$/, '')}…`;
};

/** The text of the paragraph the API would store first: its default opinion, else its first one. */
const firstParagraphText = (draft: ArticleDraft): string | null => {
  const [first] = buildParagraphCreateDtosFromBlocks(draft.blocks);
  const opinion = first?.opinions.find((candidate) => candidate.isDefault) ?? first?.opinions[0];
  return opinion?.content ?? null;
};

export type SeoSnippet = {
  title: string;
  description: string | null;
};

/** What search engines would be given for the draft once it is saved. */
export const seoSnippetOf = (draft: ArticleDraft): SeoSnippet => ({
  title: draft.seo.title.trim() || draft.title.trim(),
  description: draft.seo.description.trim() || draft.summary.trim() || seoExcerpt(firstParagraphText(draft)),
});
