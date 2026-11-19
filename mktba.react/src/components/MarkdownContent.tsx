import React from 'react';
import ReactMarkdown from 'react-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

type MarkdownContentProps = {
  content: string;
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

/** The part of an mdast node the heading pass reads: headings carry `depth`, parents `children`. */
type MarkdownNode = {
  type: string;
  depth?: number;
  children?: MarkdownNode[];
};

const collectHeadings = (node: MarkdownNode, headings: MarkdownNode[]): MarkdownNode[] => {
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
function remarkNestHeadings() {
  return (tree: MarkdownNode) => {
    const headings = collectHeadings(tree, []);
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
}

const remarkPlugins = [remarkGfmSyntax, remarkNestHeadings];

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={remarkPlugins}
    components={{
      a: (props) => {
        const { href } = props;
        if (href?.startsWith('#')) {
          return <a {...props} />;
        }
        return <a {...props} target="_blank" rel="noopener noreferrer" />;
      },
      img: (props) => <img {...props} loading="lazy" decoding="async" />,
    }}
  >
    {content}
  </ReactMarkdown>
);

export default MarkdownContent;
