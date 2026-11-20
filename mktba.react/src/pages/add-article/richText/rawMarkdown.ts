import { mergeAttributes, Node } from '@tiptap/core';
import { RAW_BLOCK, RAW_INLINE } from './markdownDocument';

type RawMarkdownOptions = {
  /** Tooltip saying what the raw text is. */
  label: string;
};

/**
 * A block of Markdown the editor keeps as typed (a table, a footnote definition, a task list…):
 * edited as plain monospaced text and written back verbatim.
 */
export const RawMarkdownBlock = Node.create<RawMarkdownOptions>({
  name: RAW_BLOCK,
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  addOptions() {
    return { label: '' };
  },

  parseHTML() {
    return [{ tag: 'pre[data-raw-markdown]', preserveWhitespace: 'full' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, { 'data-raw-markdown': '', class: 'rich-text-raw', title: this.options.label }),
      ['code', 0],
    ];
  },
});

/**
 * An inline piece of Markdown the editor keeps as typed (a footnote reference, a reference link,
 * an image): one unit the caret steps over, written back verbatim.
 */
export const RawMarkdownInline = Node.create<RawMarkdownOptions>({
  name: RAW_INLINE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { label: '' };
  },

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-raw-inline') ?? '',
        renderHTML: (attributes) => ({ 'data-raw-inline': attributes.source }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-raw-inline]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'rich-text-raw-inline', title: this.options.label }), String(node.attrs.source)];
  },

  renderText({ node }) {
    return String(node.attrs.source);
  },
});
