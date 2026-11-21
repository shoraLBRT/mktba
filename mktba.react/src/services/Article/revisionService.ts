import apiClient from '../../shared/api-client/ApiClient';
import type {
  ArticleRevisionComparisonDto,
  ArticleRevisionDto,
  ArticleRevisionSummaryDto,
} from '../../shared/types/ApiTypes';

/** The article's revisions, newest first (admins, and authors for their own articles). */
export const getArticleRevisions = async (articleId: number): Promise<ArticleRevisionSummaryDto[]> => {
  const response = await apiClient.get<ArticleRevisionSummaryDto[]>(`/articles/${articleId}/revisions`);
  return response.data;
};

/** Both revisions with their snapshots; the difference is rendered on the client. */
export const compareArticleRevisions = async (
  articleId: number,
  from: number,
  to: number,
): Promise<ArticleRevisionComparisonDto> => {
  const response = await apiClient.get<ArticleRevisionComparisonDto>(`/articles/${articleId}/revisions/compare`, {
    params: { from, to },
  });
  return response.data;
};

/** Rolls the article back to a revision; the server saves it as a new revision and returns that one. */
export const restoreArticleRevision = async (
  articleId: number,
  number: number,
  comment?: string,
): Promise<ArticleRevisionSummaryDto> => {
  const response = await apiClient.post<ArticleRevisionSummaryDto>(
    `/articles/${articleId}/revisions/${number}/restore`,
    { comment: comment?.trim() || null },
  );
  return response.data;
};

/** One revision with its snapshot. */
export const getArticleRevision = async (articleId: number, number: number): Promise<ArticleRevisionDto> => {
  const response = await apiClient.get<ArticleRevisionDto>(`/articles/${articleId}/revisions/${number}`);
  return response.data;
};
