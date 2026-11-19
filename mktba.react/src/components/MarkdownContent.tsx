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

const remarkPlugins = [remarkGfmSyntax];

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
