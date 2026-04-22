import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownContentProps = {
  content: string;
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: (props) => {
        const { href } = props;
        if (href?.startsWith('#')) {
          return <a {...props} />;
        }
        return <a {...props} target="_blank" rel="noopener noreferrer" />;
      },
    }}
  >
    {content}
  </ReactMarkdown>
);

export default MarkdownContent;
