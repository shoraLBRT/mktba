import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type {
  ArticleReviewArticlePageDto,
  ArticleReviewContextDto,
  ArticleReviewCreateDto,
  ArticleReviewDto,
} from '../shared/types/ApiTypes';

export type ArticleReviewFilter = {
  query: string;
  page: number;
  pageSize: number;
};

/** One page of the published articles a scholar may review (V-03, #119), the latest edited first. */
export const getArticlesForReview = async (filter: ArticleReviewFilter): Promise<ArticleReviewArticlePageDto> => {
  const response = await apiClient.get<ArticleReviewArticlePageDto>('/article-reviews', {
    params: { q: filter.query.trim() || undefined, page: filter.page, pageSize: filter.pageSize },
  });
  return response.data;
};

export const articlesForReviewQueryKey = (filter: ArticleReviewFilter) =>
  [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REVIEWS, filter] as const;

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
