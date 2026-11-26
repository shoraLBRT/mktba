import type { ArticleReviewVerdict, ArticleSnapshotDto } from './types/ApiTypes';

/**
 * Client mirror of the scholar review rules (V-03, #119; `ArticleReviewService` on the server, which
 * decides). The verdicts in the order the form offers them.
 */
export const ARTICLE_REVIEW_VERDICTS: readonly ArticleReviewVerdict[] = ['Confirmed', 'ConfirmedWithRemarks', 'HasErrors'];

/** The longest comment the API keeps (`ArticleReview.CommentMaxLength`). */
export const ARTICLE_REVIEW_COMMENT_MAX_LENGTH = 4000;

/** Remarks and errors must be named; a plain confirmation needs no comment. */
export const reviewNeedsComment = (verdict: ArticleReviewVerdict): boolean => verdict !== 'Confirmed';

/** Whether the form may be sent: a verdict, and a comment where the verdict needs one. */
export const canSubmitReview = (verdict: ArticleReviewVerdict | null, comment: string): verdict is ArticleReviewVerdict =>
  verdict !== null && (!reviewNeedsComment(verdict) || comment.trim().length > 0);

/**
 * The revision as readers of one school see it — what a scholar with that school reviews: a
 * paragraph common to all schools stays, and a block of opinions keeps only the opinion of the
 * school, or the default one where the school has none. Without a school, the whole revision.
 */
export const scopeSnapshot = (snapshot: ArticleSnapshotDto, schoolId: number | null | undefined): ArticleSnapshotDto => {
  if (schoolId === null || schoolId === undefined) return snapshot;
  return {
    ...snapshot,
    paragraphs: snapshot.paragraphs.map((paragraph) => {
      if (paragraph.opinions.length <= 1) return paragraph;
      const chosen =
        paragraph.opinions.find((opinion) => opinion.schoolIds.includes(schoolId))
        ?? paragraph.opinions.find((opinion) => opinion.isDefault)
        ?? paragraph.opinions[0];
      return { ...paragraph, opinions: [chosen] };
    }),
  };
};
