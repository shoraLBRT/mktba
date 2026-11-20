import React, { useMemo, type ComponentProps } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import { Link } from 'react-router';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { collectHeadings, nestHeadings, type MarkdownNode } from '../shared/markdownHeadings';

/** The anchor of one heading. */
export type HeadingAnchor = {
  /** The heading's element id. */
  id: string;
  /** The heading's plain text; it names the heading. */
  text: string;
  /** Accessible name of the heading's link to itself. */
  linkLabel: string;
};

type MarkdownContentProps = {
  content: string;
  /**
   * Anchors for the content's headings, in order (see `buildArticleOutline`): each heading gets
   * the id and a link to itself. Without it headings are rendered plain.
   */
  headingAnchors?: HeadingAnchor[];
};

/** The parser settings remark keeps in the processor's data (declared by `remark-parse`). */
type MarkdownParserData = {
  micromarkExtensions?: unknown[];
  fromMarkdownExtensions?: unknown[];
};

/**
 * GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks, footnotes) for parsing
 * only. `remark-gfm` also registers the GFM serializer (`mdast-util-to-markdown`), which rendering
 * never calls but which landed in the article page's JavaScript; this plugin leaves it out.
 */
function remarkGfmSyntax(this: { data(): object }) {
  const data = this.data() as MarkdownParserData;
  (data.micromarkExtensions ??= []).push(gfm());
  (data.fromMarkdownExtensions ??= []).push(gfmFromMarkdown());
}

/** Headings start at `h2` and never skip a level: see {@link nestHeadings}. */
const remarkNestHeadings = () => nestHeadings;

/** Gives the headings their ids, in document order — the order `parseMarkdownHeadings` lists them in. */
const remarkHeadingIds = (anchors: HeadingAnchor[]) => () => (tree: MarkdownNode) => {
  collectHeadings(tree).forEach((heading, index) => {
    const anchor = anchors[index];
    if (anchor) {
      heading.data = { ...heading.data, hProperties: { ...heading.data?.hProperties, id: anchor.id } };
    }
  });
};

const basePlugins = [remarkGfmSyntax, remarkNestHeadings];

const HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * A heading with an anchor carries a link to itself after its text. The heading is named by its
 * text alone (`aria-label`), so the link's name does not end up in the heading's.
 */
const anchoredHeadings = (anchors: HeadingAnchor[]): Components => {
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  return Object.fromEntries(
    HEADING_TAGS.map((Tag) => [
      Tag,
      ({ children, id, ...rest }: ComponentProps<typeof Tag> & ExtraProps) => {
        // `node` is react-markdown's own prop, not an attribute.
        const props = { ...rest, node: undefined };
        const anchor = id ? anchorById.get(id) : undefined;
        if (!anchor) {
          return <Tag id={id} {...props}>{children}</Tag>;
        }
        return (
          <Tag id={id} aria-label={anchor.text} {...props}>
            {children}
            <a href={`#${anchor.id}`} className="heading-anchor" aria-label={anchor.linkLabel}>
              <span aria-hidden="true">#</span>
            </a>
          </Tag>
        );
      },
    ]),
  );
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, headingAnchors }) => {
  const anchors = headingAnchors?.length ? headingAnchors : null;
  const remarkPlugins = useMemo(
    () => (anchors ? [...basePlugins, remarkHeadingIds(anchors)] : basePlugins),
    [anchors],
  );
  const headingComponents = useMemo(() => (anchors ? anchoredHeadings(anchors) : {}), [anchors]);

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      components={{
        ...headingComponents,
        a: (props) => {
          const { href } = props;
          if (href?.startsWith('#')) {
            return <a {...props} />;
          }
          // A site-relative link (an article's `/{slug}`, E-10) stays in the tab as a client-side navigation.
          if (href?.startsWith('/') && !href.startsWith('//')) {
            // `node` is react-markdown's own prop, not an attribute; `Link` builds `href` from `to`.
            const linkProps = { ...props, node: undefined, href: undefined };
            return <Link {...linkProps} to={href} />;
          }
          return <a {...props} target="_blank" rel="noopener noreferrer" />;
        },
        img: (props) => <img {...props} loading="lazy" decoding="async" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownContent;
