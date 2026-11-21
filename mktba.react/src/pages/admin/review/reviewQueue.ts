import { APP_CONSTANTS } from '../../../constants/AppConstants';
import type { ArticleSnapshotDto, ReviewQueueItemDto } from '../../../shared/types/ApiTypes';

/**
 * What a reviewer compares for one article of the moderation queue (A-04): the revision readers
 * were last given against the newest one, which approval publishes. A never-published article is
 * compared with nothing, so all of it reads as new.
 */
export type ReviewComparison =
  | { kind: 'changes'; from: number; to: number }
  | { kind: 'newArticle'; revision: number }
  | { kind: 'unchanged'; revision: number }
  | { kind: 'noRevisions' };

export const reviewComparisonOf = (
  item: Pick<ReviewQueueItemDto, 'latestRevisionNumber' | 'publishedRevisionNumber'>,
): ReviewComparison => {
  const latest = item.latestRevisionNumber;
  const published = item.publishedRevisionNumber ?? null;
  if (latest <= 0) {
    return { kind: 'noRevisions' };
  }
  if (published === null) {
    return { kind: 'newArticle', revision: latest };
  }
  return published === latest ? { kind: 'unchanged', revision: latest } : { kind: 'changes', from: published, to: latest };
};

/** An article with nothing in it: the «before» side of a never-published article. */
export const EMPTY_SNAPSHOT: ArticleSnapshotDto = {
  schemaVersion: 3,
  title: '',
  slug: '',
  summary: null,
  tags: [],
  paragraphs: [],
  relatedLinks: [],
};

/** Returning an article needs a comment: the author has to learn what to fix. */
export const canReturnWith = (comment: string): boolean => comment.trim().length > 0;

/** The moderation queue's query key; under the admin articles key, so every article change refreshes it. */
export const REVIEW_QUEUE_QUERY_KEY = [APP_CONSTANTS.QUERY_KEYS.ADMIN_ARTICLES, 'review-queue'] as const;
