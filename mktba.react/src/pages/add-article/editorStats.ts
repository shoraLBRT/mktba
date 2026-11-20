import type { EditorBlock } from './types';

/** The figures the editor's right rail shows about the draft. */
export type EditorStats = {
  blockCount: number;
  paragraphCount: number;
  characterCount: number;
  wordCount: number;
  readingTimeMinutes: number;
};

const WORDS_PER_MINUTE = 180;

/** Counts the draft: `previewMarkdown` is the document the preview renders from the same blocks. */
export const computeEditorStats = (blocks: EditorBlock[], previewMarkdown: string): EditorStats => {
  const paragraphCount = blocks.filter((block) =>
    block.kind === 'versioned'
      ? block.variants.some((variant) => variant.content.trim())
      : block.kind === 'paragraph' && block.content.trim(),
  ).length;

  const characterCount = blocks.reduce(
    (sum, block) =>
      sum + (block.kind === 'versioned'
        ? block.variants.reduce((variantSum, variant) => variantSum + variant.content.length, 0)
        : block.content.length),
    0,
  );

  const normalized = previewMarkdown.replace(/[#>*_`~[\]()!-]+/g, ' ').trim();
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;

  return {
    blockCount: blocks.length,
    paragraphCount,
    characterCount,
    wordCount,
    readingTimeMinutes: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };
};
