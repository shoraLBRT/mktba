import ReactMarkdown, { type Components } from 'react-markdown';
import { remarkGfmSyntax } from '../../shared/remarkGfmSyntax';
import { rehypeArabic } from '../../shared/rehypeArabic';
import { safeCommentHref } from '../../shared/articleComments';

/**
 * The «Markdown-минимум» of a comment (C-01, #127): paragraphs and line breaks, bold, italic, inline
 * code and code blocks, quotes, links. Every other element (headings, lists, tables, images, raw
 * HTML…) is dropped and only its text kept; raw HTML is never rendered. `span` comes only from
 * `rehypeArabic` (`lang` and `dir` on Arabic runs): raw HTML never gets this far.
 */
const COMMENT_ELEMENTS = ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'a', 'span'];

const remarkPlugins = [remarkGfmSyntax];
const rehypePlugins = [rehypeArabic];

const components: Components = {
  // A user's link is never one search engines should follow (C-06, #132), and opens in a new tab.
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className="break-words underline">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

/** Anything but an http(s) URL or a site-relative path loses its link (the text stays). */
const urlTransform = (url: string): string => safeCommentHref(url) ?? '';

export const CommentMarkdown = ({ body }: { body: string }) => (
  <div className="comment-body space-y-2 break-words text-[15px] leading-6 text-[var(--color-ink-default)] [&_blockquote]:border-s-2 [&_blockquote]:border-[var(--color-border-soft)] [&_blockquote]:ps-3 [&_blockquote]:text-[var(--color-ink-muted)] [&_code]:rounded [&_code]:bg-[var(--color-page-panel)] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--color-page-panel)] [&_pre]:p-3">
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      allowedElements={COMMENT_ELEMENTS}
      unwrapDisallowed
      skipHtml
      urlTransform={urlTransform}
      components={components}
    >
      {body}
    </ReactMarkdown>
  </div>
);
