import type { FormatAction } from './EditorBottomToolbar';

/** The placeholder texts a format inserts when nothing is selected. */
export type MarkdownSnippets = {
  insertText: string;
  linkSnippet: string;
  listSnippet: string;
  quoteSnippet: string;
};

/** A textarea's text with the selection to restore after the change. */
export type FormattedText = { value: string; selectionStart: number; selectionEnd: number };

/**
 * Applies a toolbar format to the selection `start…end` of `value`: wraps it in inline marks,
 * prefixes each of its lines, or inserts a footnote reference with its definition at the end.
 */
export const applyMarkdownFormat = (
  value: string,
  start: number,
  end: number,
  action: FormatAction,
  snippets: MarkdownSnippets,
): FormattedText => {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  const wrap = (prefix: string, suffix: string, fallback: string): FormattedText => {
    const text = selected || fallback;
    const selectionStart = start + prefix.length;
    return { value: `${before}${prefix}${text}${suffix}${after}`, selectionStart, selectionEnd: selectionStart + text.length };
  };

  const prefixLines = (prefix: (index: number) => string, fallback: string): FormattedText => {
    const text = (selected || fallback)
      .split('\n')
      .map((line, index) => `${prefix(index)}${line}`)
      .join('\n');
    return { value: `${before}${text}${after}`, selectionStart: start, selectionEnd: start + text.length };
  };

  switch (action) {
    case 'bold':
      return wrap('**', '**', snippets.insertText);
    case 'italic':
      return wrap('_', '_', snippets.insertText);
    case 'link':
      return wrap('[', '](https://example.com)', snippets.linkSnippet);
    case 'bulletList':
      return prefixLines(() => '- ', snippets.listSnippet);
    case 'orderedList':
      return prefixLines((index) => `${index + 1}. `, snippets.listSnippet);
    case 'quote':
      return prefixLines(() => '> ', snippets.quoteSnippet);
    case 'footnote': {
      const n = (value.match(/\[\^\d+\]/g) ?? []).length + 1;
      const ref = `[^${n}]`;
      const cursor = start + ref.length;
      return { value: `${before}${ref}${after}\n[^${n}]: `, selectionStart: cursor, selectionEnd: cursor };
    }
  }
};

/** Backslash-escapes the characters that would end or break a link's text. */
const escapeLinkText = (text: string): string => text.replace(/[[\]\\]/g, (character) => `\\${character}`);

/**
 * Replaces the selection `start…end` of `value` with a link to the article at `href` (the site-
 * relative `/{slug}`): the selected text becomes the link text, or the article's title when nothing
 * is selected. The link text is selected afterwards.
 */
export const insertArticleLink = (
  value: string,
  start: number,
  end: number,
  article: { title: string; href: string },
): FormattedText => {
  const selected = value.slice(start, end);
  const text = selected || escapeLinkText(article.title);
  const selectionStart = start + 1;
  return {
    value: `${value.slice(0, start)}[${text}](${article.href})${value.slice(end)}`,
    selectionStart,
    selectionEnd: selectionStart + text.length,
  };
};
