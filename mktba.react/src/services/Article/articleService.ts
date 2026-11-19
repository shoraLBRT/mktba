import apiClient from '../../shared/api-client/ApiClient';
import type { ArticleContentCreateDto, ArticleContentDto } from '../../shared/types/ApiTypes';

export const getArticleContentById = async (id: number): Promise<ArticleContentDto> => {
  const response = await apiClient.get<ArticleContentDto>(`/articles/${id}/content`);
  return response.data;
};

/**
 * Content by slug. An old slug answers with a redirect that the browser follows, so the result's
 * `slug` can differ from the one asked for: it is then the current slug.
 */
export const getArticleContentBySlug = async (slug: string): Promise<ArticleContentDto> => {
  const response = await apiClient.get<ArticleContentDto>(`/articles/by-slug/${encodeURIComponent(slug)}/content`);
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
  createArticleContent,
  updateArticleContent,
};
