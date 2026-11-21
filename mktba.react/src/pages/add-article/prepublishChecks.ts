/**
 * The checks the publication panel runs before an article goes to review or to readers (E-14,
 * #84). They are warnings, never errors: a draft they flag still saves and still moves on — the
 * reasons a save is refused are `findArticleDraftProblem`. The status buttons ask for a
 * confirmation while any is left.
 */
import { SEO_TITLE_MAX_LENGTH } from '../../shared/seo';
import type { BrokenInternalLink } from './internalLinks';
import type { SeoSnippet } from './seoSnippet';
import type { EditorBlock } from './types';

/** Where a block's warning points: the block's id and its number in reading order, from 1. */
type BlockRef = { blockId: string; blockNumber: number };

export type PrepublishWarning =
  /** A block with no text: the save leaves it out. */
  | ({ code: 'emptyBlock' } & BlockRef)
  /** An opinion with no text in a block that has others: the save leaves it out. */
  | ({ code: 'emptyOpinion'; localId: string } & BlockRef)
  /** A block of opinions whose default opinion has no text: the save is refused until it has. */
  | ({ code: 'defaultMissing' } & BlockRef)
  /** A further opinion tied to no school: no reader's mazhab opens it (the tab says «Без мазхаба»). */
  | ({ code: 'opinionWithoutSchool'; localId: string } & BlockRef)
  /** Internal links in the block that lead nowhere a reader can open (`findBrokenInternalLinks`). */
  | ({ code: 'brokenLinks'; count: number } & BlockRef)
  /** Search engines get no description: no SEO description, summary or first paragraph. */
  | { code: 'descriptionMissing' }
  /** The title search engines get is longer than they show. */
  | { code: 'titleTooLong'; length: number; maxLength: number };

/** The statuses that put the article in front of someone else: a reviewer, then readers. */
export const isPublishingMove = (target: string): boolean => target === 'InReview' || target === 'Published';

const hasText = (content: string): boolean => content.trim() !== '';

const blockWarnings = (block: EditorBlock, ref: BlockRef): PrepublishWarning[] => {
  if (block.kind !== 'versioned') {
    return hasText(block.content) ? [] : [{ code: 'emptyBlock', ...ref }];
  }

  const filled = block.variants.filter((variant) => hasText(variant.content));
  if (filled.length === 0) {
    return [{ code: 'emptyBlock', ...ref }];
  }

  const warnings: PrepublishWarning[] = [];
  if (!filled.some((variant) => variant.isDefault)) {
    warnings.push({ code: 'defaultMissing', ...ref });
  }
  for (const variant of block.variants) {
    if (!hasText(variant.content)) {
      // An empty default is already `defaultMissing`.
      if (!variant.isDefault) warnings.push({ code: 'emptyOpinion', localId: variant.localId, ...ref });
    } else if (filled.length > 1 && !variant.isDefault && variant.schoolIds.length === 0) {
      // A single filled opinion is saved as a plain paragraph, common to every school.
      warnings.push({ code: 'opinionWithoutSchool', localId: variant.localId, ...ref });
    }
  }
  return warnings;
};

/** Every warning for the draft: the blocks in reading order, then the search snippet. */
export const findPrepublishWarnings = (
  blocks: EditorBlock[],
  snippet: SeoSnippet,
  brokenLinks: BrokenInternalLink[],
): PrepublishWarning[] => {
  const brokenByBlock = new Map<string, number>();
  for (const link of brokenLinks) {
    brokenByBlock.set(link.blockId, (brokenByBlock.get(link.blockId) ?? 0) + 1);
  }

  const warnings = blocks.flatMap((block, index): PrepublishWarning[] => {
    const ref = { blockId: block.id, blockNumber: index + 1 };
    const count = brokenByBlock.get(block.id);
    return [...blockWarnings(block, ref), ...(count ? [{ code: 'brokenLinks' as const, count, ...ref }] : [])];
  });

  if (snippet.description === null) {
    warnings.push({ code: 'descriptionMissing' });
  }
  if (snippet.title.length > SEO_TITLE_MAX_LENGTH) {
    warnings.push({ code: 'titleTooLong', length: snippet.title.length, maxLength: SEO_TITLE_MAX_LENGTH });
  }
  return warnings;
};
