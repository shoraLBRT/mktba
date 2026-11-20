import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { useLocale } from '../../../localization/hooks';
import { cn } from '../../../shared/lib/cn';
import { PasteCleanup } from './editorExtensions';
import { documentToMarkdown, markdownToDocument, normalizeMarkdown, RAW_BLOCK, RAW_INLINE } from './markdownDocument';
import { RawMarkdownBlock, RawMarkdownInline } from './rawMarkdown';
import './richTextEditor.css';

/** A toolbar format the rich-text editor applies itself. */
export type RichTextFormat = 'bold' | 'italic' | 'bulletList' | 'orderedList' | 'quote' | 'footnote';

/** What the page asks of the text that has the focus (toolbar, pickers). */
export type RichTextHandle = {
  focus: () => void;
  format: (format: RichTextFormat) => void;
  /** The address of the link at the selection, or null when there is none. */
  linkHref: () => string | null;
  /** Links the selection (or the link at the caret) to `href`; with no selection inserts `href` as linked text. Null removes the link. */
  setLink: (href: string | null) => void;
  /** Links the selection to the article, or inserts its title as linked text; the link text is selected afterwards. */
  insertArticleLink: (article: { title: string; href: string }) => void;
  undo: () => void;
  redo: () => void;
};

type RichTextEditorProps = {
  /** The Markdown text. */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  /** Ctrl/⌘+K: the page opens its link dialog. */
  onRequestLink: () => void;
  /** A key pressed in the text, before the editor handles it; true when the caller took it (the `/` menu). */
  onKeyDown?: (event: KeyboardEvent) => boolean;
  handleRef: (handle: RichTextHandle | null) => void;
  disabled: boolean;
  placeholder: string;
  className?: string;
};

const nextFootnoteNumber = (markdown: string) =>
  Math.max(0, ...Array.from(markdown.matchAll(/\[\^(\d+)\]/g), (match) => Number(match[1]))) + 1;

const createHandle = (editor: Editor): RichTextHandle => ({
  focus: () => {
    editor.commands.focus();
  },
  format: (format) => {
    const chain = editor.chain().focus();
    switch (format) {
      case 'bold':
        chain.toggleBold().run();
        return;
      case 'italic':
        chain.toggleItalic().run();
        return;
      case 'bulletList':
        chain.toggleBulletList().run();
        return;
      case 'orderedList':
        chain.toggleOrderedList().run();
        return;
      case 'quote':
        chain.toggleBlockquote().run();
        return;
      case 'footnote': {
        const number = nextFootnoteNumber(documentToMarkdown(editor.getJSON()));
        const definition = `[^${number}]: `;
        chain.insertContent({ type: RAW_INLINE, attrs: { source: `[^${number}]` } }).run();
        // The definition goes last, before the empty paragraph the editor keeps at the end.
        const { doc } = editor.state;
        const last = doc.lastChild;
        const position = last && last.type.name === 'paragraph' && last.content.size === 0 ? doc.content.size - last.nodeSize : doc.content.size;
        editor
          .chain()
          .insertContentAt(position, { type: RAW_BLOCK, content: [{ type: 'text', text: definition }] })
          .setTextSelection(position + 1 + definition.length)
          .focus()
          .run();
        return;
      }
    }
  },
  linkHref: () => (editor.isActive('link') ? (editor.getAttributes('link').href as string | undefined) ?? null : null),
  setLink: (href) => {
    const chain = editor.chain().focus();
    if (!href) {
      chain.extendMarkRange('link').unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      const linked: JSONContent = { type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] };
      chain.insertContent(linked).run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
  },
  insertArticleLink: ({ title, href }) => {
    const { from, empty } = editor.state.selection;
    if (!empty) {
      editor.chain().focus().setLink({ href }).run();
      return;
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: title, marks: [{ type: 'link', attrs: { href } }] })
      .setTextSelection({ from, to: from + title.length })
      .run();
  },
  undo: () => {
    editor.chain().focus().undo().run();
  },
  redo: () => {
    editor.chain().focus().redo().run();
  },
});

/**
 * The rich-text editor of one opinion (decision D2): TipTap over the stored Markdown. It holds the
 * text as a document, writes Markdown back on every edit and never on its own — an untouched text,
 * or one edited back to what was loaded, reports exactly the value it was given, so the editor's
 * normalisation does not make an article look changed (E-03, E-02).
 */
export const RichTextEditor = ({
  value,
  onChange,
  onFocus,
  onRequestLink,
  onKeyDown,
  handleRef,
  disabled,
  placeholder,
  className,
}: RichTextEditorProps) => {
  const t = useLocale().addArticleEditor.richText;
  const callbacks = useRef({ onChange, onFocus, onKeyDown, handleRef, placeholder });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onFocus, onKeyDown, handleRef, placeholder };
  });

  /** The last value given from outside (loaded, restored, imported, styled by the AI) and its normal form. */
  const external = useRef({ value, normalized: normalizeMarkdown(value) });
  /** The value the editor holds as far as the page knows: the last one given or reported. */
  const current = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        // Autolink would make the link mark inclusive: text typed after a link would join it.
        link: { openOnClick: false, autolink: false, markdownLinks: true },
      }),
      // The same text as the accessible name, which follows the prop (see ttributes).
      Placeholder.configure({ placeholder: ({ editor: current }) => current.view.dom.getAttribute('aria-label') ?? '' }),
      RawMarkdownBlock.configure({ label: t.rawBlock }),
      RawMarkdownInline.configure({ label: t.rawInline }),
      PasteCleanup,
    ],
    content: markdownToDocument(value),
    editable: !disabled,
    // The admin is rendered only in the browser (clientLoader.hydrate), so the editor exists from the first render.
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: () => ({
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': callbacks.current.placeholder,
        class: cn('rich-text-editor article-markdown', className),
      }),
      handleKeyDown: (_view, event) => callbacks.current.onKeyDown?.(event) ?? false,
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = documentToMarkdown(updated.getJSON());
      const next = markdown === external.current.normalized ? external.current.value : markdown;
      if (next !== current.current) {
        current.current = next;
        callbacks.current.onChange(next);
      }
    },
    onFocus: () => callbacks.current.onFocus(),
  });

  useEffect(() => {
    if (value === current.current) {
      return;
    }
    current.current = value;
    external.current = { value, normalized: normalizeMarkdown(value) };
    editor.commands.setContent(markdownToDocument(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  useEffect(() => {
    const register = callbacks.current.handleRef;
    register(createHandle(editor));
    return () => register(null);
  }, [editor]);

  return (
    <div
      onKeyDown={(event) => {
        // Ctrl/⌘+K by the physical key, so it works in any keyboard layout.
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
          event.preventDefault();
          onRequestLink();
        }
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
};
