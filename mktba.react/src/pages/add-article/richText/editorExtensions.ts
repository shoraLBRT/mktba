import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { markdownToDocument, RAW_BLOCK } from './markdownDocument';
import { cleanPastedHtml } from './pasteCleanup';

/**
 * Paste: HTML (Word, a web page, another editor) is cleaned first and then read by the schema,
 * which keeps only the formatting the editor knows; plain text is read as Markdown — the stored
 * format — so text copied from a Markdown source keeps its formatting. Inside a code block or a raw
 * Markdown block plain text stays as it is.
 */
export const PasteCleanup = Extension.create({
  name: 'pasteCleanup',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('pasteCleanup'),
        props: {
          transformPastedHTML: cleanPastedHtml,
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data || data.types.includes('text/html') || editor.isActive('codeBlock') || editor.isActive(RAW_BLOCK)) {
              return false;
            }
            const text = data.getData('text/plain');
            if (!text) {
              return false;
            }
            const content = markdownToDocument(text).content ?? [];
            // A single paragraph goes into the current one instead of splitting it.
            const inline = content.length === 1 && content[0].type === 'paragraph' ? (content[0].content ?? []) : content;
            return editor.commands.insertContent(inline);
          },
        },
      }),
    ];
  },
});

