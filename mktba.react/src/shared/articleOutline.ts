import { parseMarkdownHeadings } from './markdownHeadings';
import { slugFromTitle } from './slug';

/** A heading with the anchor it gets on the article page. */
export type OutlineHeading = {
  /** Element id, unique on the page; the link to the heading is `#id`. */
  id: string;
  text: string;
  /** Rendered level, 2–6. */
  depth: number;
};

/** One paragraph slot of the article with its anchors. */
export type OutlineParagraph = {
  /** Anchor of the whole paragraph: `p-{paragraph id}`, the same through edits and reordering. */
  anchorId: string;
  /** The headings of the shown text, in order. */
  headings: OutlineHeading[];
  /** The text opens with a heading, so the heading's own link also marks the paragraph's start. */
  startsWithHeading: boolean;
};

/** The id of the block above the first paragraph (infobox); the outline's first entry. */
export const ARTICLE_OVERVIEW_ANCHOR = 'article-overview';

const HEADING_FALLBACK = 'section';

export const paragraphAnchorId = (paragraphId: number): string => `p-${paragraphId}`;

/** `slugFromTitle` answers `article` when nothing can be transliterated (an Arabic heading). */
const headingSlug = (text: string): string => {
  const slug = slugFromTitle(text);
  return slug === 'article' && !/article/i.test(text) ? HEADING_FALLBACK : slug;
};

/**
 * Anchors of an article's paragraphs and headings.
 *
 * A heading's id is its transliterated text (`Условия намаза` → `usloviya-namaza`), so a link
 * survives every edit that leaves the heading's wording alone; a repeated heading gets `-2`,
 * `-3`… in reading order. Ids already taken on the page (paragraph anchors, the overview) are
 * never given to a heading.
 */
export const buildArticleOutline = (
  paragraphs: { paragraphId: number; content: string }[],
): OutlineParagraph[] => {
  const taken = new Set<string>([
    ARTICLE_OVERVIEW_ANCHOR,
    ...paragraphs.map((paragraph) => paragraphAnchorId(paragraph.paragraphId)),
  ]);

  const uniqueId = (base: string): string => {
    let id = base;
    for (let attempt = 2; taken.has(id); attempt += 1) {
      id = `${base}-${attempt}`;
    }
    taken.add(id);
    return id;
  };

  return paragraphs.map((paragraph) => {
    const { headings, startsWithHeading } = parseMarkdownHeadings(paragraph.content);
    return {
      anchorId: paragraphAnchorId(paragraph.paragraphId),
      headings: headings.map((heading) => ({ ...heading, id: uniqueId(headingSlug(heading.text)) })),
      startsWithHeading,
    };
  });
};
