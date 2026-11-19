import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

/** The part of an mdast node the heading passes read. */
export type MarkdownNode = {
  type: string;
  depth?: number;
  value?: string;
  alt?: string | null;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
};

/** A heading of a markdown text as the page renders it. */
export type MarkdownHeading = {
  /** Rendered level, 2–6 (see {@link nestHeadings}). */
  depth: number;
  /** Plain text of the heading, without markup. */
  text: string;
};

/** Every heading of the tree in document order. */
export const collectHeadings = (node: MarkdownNode, headings: MarkdownNode[] = []): MarkdownNode[] => {
  if (node.type === 'heading') {
    headings.push(node);
  }
  node.children?.forEach((child) => collectHeadings(child, headings));
  return headings;
};

/**
 * Markdown is always rendered under the page's own `h1`, so its headings start at `h2`: the
 * shallowest heading in the content becomes `h2`, deeper ones keep their relative depth, and a
 * heading never goes more than one level below the one before it (`#` then `###` renders
 * `h2` then `h3`). Levels stop at `h6`.
 */
export const nestHeadings = (tree: MarkdownNode): void => {
  const headings = collectHeadings(tree);
  if (headings.length === 0) {
    return;
  }
  const shallowest = Math.min(...headings.map((heading) => heading.depth ?? 1));
  let previous = 1;
  headings.forEach((heading) => {
    const shifted = (heading.depth ?? 1) - shallowest + 2;
    const depth = Math.min(shifted, previous + 1, 6);
    heading.depth = depth;
    previous = depth;
  });
};

const plainText = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.children?.map(plainText).join('') ?? '';

/**
 * The headings of a markdown text, in the order and at the levels `MarkdownContent` renders them,
 * and whether the text opens with one. Parsed with the renderer's own syntax (GFM), so a `#` line
 * inside a code block is not a heading here either.
 */
export const parseMarkdownHeadings = (
  content: string,
): { headings: MarkdownHeading[]; startsWithHeading: boolean } => {
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MarkdownNode;
  nestHeadings(tree);
  return {
    headings: collectHeadings(tree).map((heading) => ({
      depth: heading.depth ?? 2,
      text: plainText(heading).replace(/\s+/g, ' ').trim(),
    })),
    startsWithHeading: tree.children?.[0]?.type === 'heading',
  };
};
