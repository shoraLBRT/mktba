import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type {
  ArticleReviewArticlePageDto,
  ArticleReviewContextDto,
  ArticleReviewCreateDto,
  ArticleReviewDto,
  ScholarReviewHistoryPageDto,
} from '../shared/types/ApiTypes';

export type ArticleReviewFilter = {
  query: string;
  /** Only the queue: leaves out the articles the caller reviewed whose mark is current (V-07, #123). */
  queueOnly: boolean;
  page: number;
  pageSize: number;
};

/**
 * One page of the scholar's queue (V-03 #119, V-07 #123): re-reviews first, then the articles not
 * reviewed yet (matching the specialization and madhab first), then, unless `queueOnly`, the reviewed ones.
 */
export const getArticlesForReview = async (filter: ArticleReviewFilter): Promise<ArticleReviewArticlePageDto> => {
  const response = await apiClient.get<ArticleReviewArticlePageDto>('/article-reviews', {
    params: { q: filter.query.trim() || undefined, queue: filter.queueOnly || undefined, page: filter.page, pageSize: filter.pageSize },
  });
  return response.data;
};

export const articlesForReviewQueryKey = (filter: ArticleReviewFilter) =>
  [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVIEWS, filter] as const;

/** The caller's reviews across articles, the latest given first (V-07, #123). */
export const getMyReviewHistory = async (page: number, pageSize: number): Promise<ScholarReviewHistoryPageDto> => {
  const response = await apiClient.get<ScholarReviewHistoryPageDto>('/article-reviews/history', { params: { page, pageSize } });
  return response.data;
};

export const myReviewHistoryQueryKey = (page: number) => [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVIEWS, 'history', page] as const;

/** The article's latest revision, what the caller's review covers and their reviews of it. */
export const getArticleReviewContext = async (articleId: number): Promise<ArticleReviewContextDto> => {
  const response = await apiClient.get<ArticleReviewContextDto>(`/article-reviews/${articleId}`);
  return response.data;
};

export const articleReviewQueryKey = (articleId: number) => [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVIEW, articleId] as const;

/** Gives the verdict on the revision the scholar read; a second verdict on it replaces the first. */
export const submitArticleReview = async (articleId: number, review: ArticleReviewCreateDto): Promise<ArticleReviewDto> => {
  const response = await apiClient.post<ArticleReviewDto>(`/article-reviews/${articleId}`, review);
  return response.data;
};
