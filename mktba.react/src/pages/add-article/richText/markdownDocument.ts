import type { JSONContent } from '@tiptap/core';
import type { Nodes, PhrasingContent, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

/**
 * Markdown ↔ the rich-text editor's document (decision D2: Markdown stays the stored format).
 *
 * The text is parsed with the reader's own parser (micromark + GFM, as `MarkdownContent`), so the
 * editor sees what the page renders. What the editor can show and edit — paragraphs, headings,
 * bold, italic, strikethrough, inline code, links, hard breaks, lists, quotes, code blocks, rules —
 * becomes editor nodes; everything else keeps its Markdown source verbatim: a top-level block the
 * editor cannot model as a whole (a table, a footnote definition, a task list, a link reference
 * definition, HTML, a list or quote holding any of them) becomes a `rawMarkdown` block, and an inline
 * construct (a footnote reference, a reference link, an image, inline HTML) a `rawMarkdownInline`
 * atom. Nothing a text holds is lost by opening it in the editor.
 */

export const RAW_BLOCK = 'rawMarkdown';
export const RAW_INLINE = 'rawMarkdownInline';

type Mark = NonNullable<JSONContent['marks']>[number];

class UnsupportedMarkdown extends Error {}

const unsupported = (): never => {
  throw new UnsupportedMarkdown();
};

const rawBlock = (source: string): JSONContent =>
  source ? { type: RAW_BLOCK, content: [{ type: 'text', text: source }] } : { type: RAW_BLOCK };

/** Parses `markdown` into the editor's document (`doc` JSON). */
export const markdownToDocument = (markdown: string): JSONContent => {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const source = (node: Nodes) => markdown.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);

  const inline = (nodes: PhrasingContent[], marks: Mark[]): JSONContent[] =>
    nodes.flatMap((node): JSONContent[] => {
      switch (node.type) {
        case 'text': {
          // A soft line break renders as a space, so it is one in the editor.
          const text = node.value.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
          return text ? [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] : [];
        }
        case 'strong':
          return inline(node.children, [...marks, { type: 'bold' }]);
        case 'emphasis':
          return inline(node.children, [...marks, { type: 'italic' }]);
        case 'delete':
          return inline(node.children, [...marks, { type: 'strike' }]);
        case 'link':
          return inline(node.children, [...marks, { type: 'link', attrs: { href: node.url, title: node.title ?? null } }]);
        case 'inlineCode':
          // The editor's code mark excludes every other mark.
          return marks.length ? unsupported() : [{ type: 'text', text: node.value, marks: [{ type: 'code' }] }];
        case 'break':
          return [{ type: 'hardBreak' }];
        case 'footnoteReference':
        case 'linkReference':
        case 'imageReference':
        case 'image':
        case 'html': {
          const text = source(node);
          return marks.length || text.includes('\n') ? unsupported() : [{ type: RAW_INLINE, attrs: { source: text } }];
        }
        default:
          return unsupported();
      }
    });

  const withContent = (node: JSONContent, content: JSONContent[]): JSONContent =>
    content.length ? { ...node, content } : node;

  const block = (node: RootContent): JSONContent => {
    switch (node.type) {
      case 'paragraph':
        return withContent({ type: 'paragraph' }, inline(node.children, []));
      case 'heading':
        return withContent({ type: 'heading', attrs: { level: node.depth } }, inline(node.children, []));
      case 'blockquote':
        return node.children.length ? { type: 'blockquote', content: node.children.map(block) } : unsupported();
      case 'list': {
        const items = node.children.map((item): JSONContent => {
          if (item.checked !== null && item.checked !== undefined) return unsupported();
          if (item.children[0]?.type !== 'paragraph') return unsupported();
          return { type: 'listItem', content: item.children.map(block) };
        });
        return node.ordered
          ? { type: 'orderedList', attrs: { start: node.start ?? 1 }, content: items }
          : { type: 'bulletList', content: items };
      }
      case 'code':
        return node.meta
          ? unsupported()
          : withContent({ type: 'codeBlock', attrs: { language: node.lang ?? null } }, node.value ? [{ type: 'text', text: node.value }] : []);
      case 'thematicBreak':
        return { type: 'horizontalRule' };
      default:
        return unsupported();
    }
  };

  const content = tree.children.map((child) => {
    try {
      return block(child);
    } catch (error) {
      if (error instanceof UnsupportedMarkdown) return rawBlock(source(child));
      throw error;
    }
  });

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
};

const MARK_ORDER = ['link', 'bold', 'italic', 'strike'];

const sameMark = (a: Mark, b: Mark) =>
  a.type === b.type && (a.type !== 'link' || (a.attrs?.href === b.attrs?.href && (a.attrs?.title ?? null) === (b.attrs?.title ?? null)));

const opener = (mark: Mark): string => {
  switch (mark.type) {
    case 'link':
      return '[';
    case 'bold':
      return '**';
    case 'italic':
      return '*';
    case 'strike':
      return '~~';
    default:
      return '';
  }
};

const linkDestination = (href: string) =>
  href === '' || /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, (character) => encodeURIComponent(character))}>` : href;

const closer = (mark: Mark): string => {
  if (mark.type !== 'link') return opener(mark);
  const href = String(mark.attrs?.href ?? '');
  const title = mark.attrs?.title ? ` "${String(mark.attrs.title).replace(/["\\]/g, '\\$&')}"` : '';
  return `](${linkDestination(href)}${title})`;
};

const isWordCharacter = (character: string | undefined) => !!character && /[\p{L}\p{N}]/u.test(character);

/** Backslash-escapes what Markdown would read as syntax in plain text. */
const escapeText = (text: string, atLineStart: boolean): string => {
  let escaped = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if ('\\*`[]<~'.includes(character)) {
      escaped += `\\${character}`;
    } else if (character === '_' && !(isWordCharacter(text[index - 1]) && isWordCharacter(text[index + 1]))) {
      escaped += '\\_';
    } else if (character === '&' && /^&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i.test(text.slice(index))) {
      escaped += '\\&';
    } else {
      escaped += character;
    }
  }

  if (!atLineStart) return escaped;
  const trimmed = escaped.replace(/^[ \t]+/, '');
  return trimmed
    .replace(/^([#>+=-])/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');
};

const codeSpan = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const padding = text.startsWith('`') || text.endsWith('`') || (text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') ? ' ' : '';
  return `${fence}${padding}${text}${padding}${fence}`;
};

type InlinePiece = { kind: 'text'; text: string; marks: Mark[] } | { kind: 'code'; text: string } | { kind: 'break' } | { kind: 'raw'; source: string };

const markdownMarks = (node: JSONContent | undefined): Mark[] =>
  node?.type === 'text' ? (node.marks ?? []).filter((mark) => mark.type === 'code' || MARK_ORDER.includes(mark.type)) : [];

/**
 * Splits the inline nodes into pieces. Whitespace at the edge of a marked text keeps only the marks
 * the neighbour on that side shares (and a link), because `** bold**` is not emphasis in Markdown.
 */
const inlinePieces = (nodes: JSONContent[]): InlinePiece[] =>
  nodes.flatMap((node, index): InlinePiece[] => {
    if (node.type === 'hardBreak') return [{ kind: 'break' }];
    if (node.type === RAW_INLINE) return [{ kind: 'raw', source: String(node.attrs?.source ?? '') }];
    if (node.type !== 'text' || !node.text) return [];
    const marks = markdownMarks(node);
    if (marks.some((mark) => mark.type === 'code')) return [{ kind: 'code', text: node.text }];
    if (marks.length === 0) return [{ kind: 'text', text: node.text, marks }];

    const [, leading, core, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text) ?? ['', '', node.text, ''];
    const edgeMarks = (neighbour: JSONContent | undefined) => {
      const shared = markdownMarks(neighbour);
      return marks.filter((mark) => mark.type === 'link' || shared.some((other) => sameMark(mark, other)));
    };
    return [
      ...(leading ? [{ kind: 'text' as const, text: leading, marks: edgeMarks(nodes[index - 1]) }] : []),
      ...(core ? [{ kind: 'text' as const, text: core, marks }] : []),
      ...(trailing ? [{ kind: 'text' as const, text: trailing, marks: edgeMarks(nodes[index + 1]) }] : []),
    ];
  });

const serializeInline = (nodes: JSONContent[]): string => {
  let output = '';
  let open: Mark[] = [];

  const closeTo = (length: number) => {
    while (open.length > length) {
      output += closer(open[open.length - 1]);
      open = open.slice(0, -1);
    }
  };

  for (const piece of inlinePieces(nodes)) {
    if (piece.kind !== 'text') {
      closeTo(0);
      if (piece.kind === 'break') output += '\\\n';
      else if (piece.kind === 'code') output += codeSpan(piece.text);
      else output += piece.source;
      continue;
    }

    // Marks already open stay open (outermost first); the rest open in a fixed order.
    let kept = 0;
    while (kept < open.length && piece.marks.some((mark) => sameMark(mark, open[kept]))) kept += 1;
    closeTo(kept);
    const opening = piece.marks
      .filter((mark) => !open.some((current) => sameMark(current, mark)))
      .sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
    const atLineStart = output === '' || output.endsWith('\n');
    for (const mark of opening) {
      output += opener(mark);
      open = [...open, mark];
    }
    output += escapeText(piece.text, atLineStart && opening.length === 0);
  }

  closeTo(0);
  return output.replace(/\\\n$/, '');
};

const textOf = (node: JSONContent): string => (node.content ?? []).map((child) => child.text ?? '').join('');

const prefixLines = (text: string, first: string, rest: string): string =>
  text
    .split('\n')
    .map((line, index) => `${index === 0 ? first : rest}${line}`.trimEnd())
    .join('\n');

const serializeBlocks = (nodes: JSONContent[]): string =>
  nodes
    .map(serializeBlock)
    .filter((text) => text.trim() !== '')
    .join('\n\n');

/** A list that may follow a paragraph line directly (Markdown lets only these interrupt one). */
const isTightList = (node: JSONContent) =>
  node.type === 'bulletList' || (node.type === 'orderedList' && Number(node.attrs?.start ?? 1) === 1);

const serializeListItems = (node: JSONContent, marker: (index: number) => string): string =>
  (node.content ?? [])
    .map((item, index) => {
      const itemMarker = marker(index);
      return prefixLines(serializeItem(item), itemMarker, ' '.repeat(itemMarker.length));
    })
    .join('\n');

const serializeItem = (item: JSONContent): string => {
  const children = item.content ?? [];
  return children
    .map((child) => ({ child, text: serializeBlock(child) }))
    .filter(({ text }, index) => index === 0 || text.trim() !== '')
    // A nested list follows its paragraph directly, so the outer list stays tight.
    .map(({ child, text }, index) => (index === 0 ? text : `${isTightList(child) ? '\n' : '\n\n'}${text}`))
    .join('');
};

function serializeBlock(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return serializeInline(node.content ?? []);
    case 'heading': {
      // A heading is one line: a line break in it is written as a space.
      const text = serializeInline(node.content ?? []).replace(/\\\n/g, ' ');
      return text ? `${'#'.repeat(Number(node.attrs?.level ?? 2))} ${text}` : '';
    }
    case 'blockquote':
      return prefixLines(serializeBlocks(node.content ?? []), '> ', '> ').replace(/^>$/gm, '>');
    case 'bulletList':
      return serializeListItems(node, () => '- ');
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return serializeListItems(node, (index) => `${start + index}. `);
    }
    case 'codeBlock': {
      const text = textOf(node);
      const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return `${fence}${node.attrs?.language ?? ''}\n${text}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case RAW_BLOCK:
      return textOf(node);
    default:
      return '';
  }
}

/** Writes the editor's document (`doc` JSON) as Markdown. Empty paragraphs are dropped. */
export const documentToMarkdown = (document: JSONContent): string => serializeBlocks(document.content ?? []);

/** The text as the editor writes it back: `markdown` opened in the editor and saved unchanged. */
export const normalizeMarkdown = (markdown: string): string => documentToMarkdown(markdownToDocument(markdown));
