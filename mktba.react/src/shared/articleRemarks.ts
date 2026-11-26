import type { ArticleRemarkDto } from './types/ApiTypes';

/**
 * Client helpers for scholars' remarks on a block (V-06, #122; `ArticleRemarkService` on the server,
 * which decides who may do what).
 */

/** The longest message the API keeps (`ArticleRemark.MessageMaxLength`). */
export const ARTICLE_REMARK_MESSAGE_MAX_LENGTH = 4000;

export const isOpenRemark = (remark: ArticleRemarkDto): boolean => remark.status === 'Open';

/**
 * The open remarks whose block is still in the article, by paragraph id: what the editor marks next
 * to each block. A remark on one opinion counts for its paragraph.
 */
export const openRemarksByParagraph = (remarks: readonly ArticleRemarkDto[]): Map<number, ArticleRemarkDto[]> => {
  const result = new Map<number, ArticleRemarkDto[]>();
  remarks.forEach((remark) => {
    if (!isOpenRemark(remark) || remark.blockRemoved || remark.paragraphId === null || remark.paragraphId === undefined) return;
    result.set(remark.paragraphId, [...(result.get(remark.paragraphId) ?? []), remark]);
  });
  return result;
};

/** The DOM id of a remark's thread, which a block's marker in the editor scrolls to. */
export const remarkElementId = (remarkId: number): string => `article-remark-${remarkId}`;

/** Where a remark points, for its heading: the paragraph (or one opinion of it), moved or deleted since. */
export const remarkAnchorParts = (remark: ArticleRemarkDto): { order: number; movedTo: number | null; removed: boolean } => ({
  order: remark.paragraphOrder,
  movedTo:
    !remark.blockRemoved
    && remark.currentParagraphOrder !== null
    && remark.currentParagraphOrder !== undefined
    && remark.currentParagraphOrder !== remark.paragraphOrder
      ? remark.currentParagraphOrder
      : null,
  removed: remark.blockRemoved,
});
