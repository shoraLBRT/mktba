import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import { hasArabic, isArabicOnly, splitArabicRuns } from './arabicText';

/** Blocks that become right-to-left as a whole when they hold Arabic only (an ayah, a hadith, a du'a). */
const BLOCKS = new Set(['p', 'li', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th']);

/** Code is shown as written. */
const SKIPPED = new Set(['code', 'pre']);

const arabicProperties = (className: string) => ({ lang: 'ar', dir: 'rtl', className: [className] });

const textOf = (node: ElementContent | RootContent): string => {
  if (node.type === 'text') {
    return node.value;
  }
  return node.type === 'element' ? node.children.map(textOf).join('') : '';
};

/** A text node with Arabic in it becomes its pieces, each Arabic run in its own isolated span. */
const splitText = (node: Text): ElementContent[] =>
  splitArabicRuns(node.value).map((segment) =>
    segment.arabic
      ? {
          type: 'element',
          tagName: 'span',
          properties: arabicProperties('arabic'),
          children: [{ type: 'text', value: segment.text }],
        }
      : { type: 'text', value: segment.text },
  );

function mark(parent: Root | Element) {
  parent.children = parent.children.flatMap((child): (typeof child)[] => {
    if (child.type === 'text') {
      return hasArabic(child.value) ? splitText(child) : [child];
    }
    if (child.type !== 'element' || SKIPPED.has(child.tagName)) {
      return [child];
    }
    if (BLOCKS.has(child.tagName) && isArabicOnly(textOf(child))) {
      child.properties = { ...child.properties, ...arabicProperties('arabic-block') };
      return [child];
    }
    mark(child);
    return [child];
  });
}

/**
 * Marks the Arabic of an article (R-15): a block of Arabic only gets `lang="ar" dir="rtl"` and the
 * class `arabic-block`; an Arabic run inside other text is wrapped in
 * `<span lang="ar" dir="rtl" class="arabic">`. `dir` on an inline element isolates it from the
 * surrounding text (CSS `unicode-bidi: isolate`), so the punctuation around it keeps its place.
 */
export const rehypeArabic = () => (tree: Root) => {
  mark(tree);
};
