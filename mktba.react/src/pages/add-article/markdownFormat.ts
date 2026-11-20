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
