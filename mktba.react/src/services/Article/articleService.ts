import { articleLocaleParams, articleLocaleQuery, type Language } from '../../localization/language';
import apiClient from '../../shared/api-client/ApiClient';
import { SEARCH_PAGE_PARAM, SEARCH_QUERY_PARAM, type SearchRequest } from '../../shared/search';
import type {
  ArticleContentCreateDto,
  ArticleContentDto,
  ArticleVerificationDto,
  PopularArticlesDto,
  RecentArticlesDto,
  SearchResultsDto,
} from '../../shared/types/ApiTypes';

export const getArticleContentById = async (id: number): Promise<ArticleContentDto> => {
  const response = await apiClient.get<ArticleContentDto>(`/articles/${id}/content`);
  return response.data;
};

/**
 * Content by slug in a language (the URL's, I-01). An old slug answers with a redirect that the
 * browser follows, so the result's `slug` can differ from the one asked for: it is then the current slug.
 */
export const getArticleContentBySlug = async (slug: string, language: Language): Promise<ArticleContentDto> => {
  const response = await apiClient.get<ArticleContentDto>(
    `/articles/by-slug/${encodeURIComponent(slug)}/content${articleLocaleQuery(language)}`,
  );
  return response.data;
};

/** The newest and the most recently updated published articles of a language, for its home page. */
export const getRecentArticles = async (language: Language): Promise<RecentArticlesDto> => {
  const response = await apiClient.get<RecentArticlesDto>('/articles/recent', { params: articleLocaleParams(language) });
  return response.data;
};

/** The most viewed published articles of a language in the last 30 days, for its home page. */
export const getPopularArticles = async (language: Language): Promise<PopularArticlesDto> => {
  const response = await apiClient.get<PopularArticlesDto>('/articles/popular', { params: articleLocaleParams(language) });
  return response.data;
};

/** One page of the full-text search over a language's published articles (R-10, #46; I-10, #114). */
export const searchArticles = async ({ query, page }: SearchRequest, language: Language): Promise<SearchResultsDto> => {
  const response = await apiClient.get<SearchResultsDto>('/search', {
    params: { [SEARCH_QUERY_PARAM]: query, [SEARCH_PAGE_PARAM]: page, ...articleLocaleParams(language) },
  });
  return response.data;
};

export const createArticleContent = async (payload: ArticleContentCreateDto): Promise<ArticleContentDto> => {
  const response = await apiClient.post<ArticleContentDto>('/articles/content', payload);
  return response.data;
};

export const updateArticleContent = async (id: number, payload: ArticleContentDto): Promise<void> => {
  await apiClient.put(`/articles/${id}/content`, payload);
};

export const articleService = {
  getArticleContentById,
  getArticleContentBySlug,
  getRecentArticles,
  searchArticles,
  createArticleContent,
  updateArticleContent,
};

/** The scholars' marks on a published article as readers see them (V-04, #120). */
export const getArticleVerification = async (articleId: number): Promise<ArticleVerificationDto> => {
  const response = await apiClient.get<ArticleVerificationDto>(`/articles/${articleId}/verification`);
  return response.data;
};
