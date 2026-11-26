import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type { ArticleCommentCreateDto, ArticleCommentDto, ArticleCommentPageDto } from '../shared/types/ApiTypes';

/** Top-level comments a page asks for (C-01, #127); the server's default. */
export const COMMENTS_PAGE_SIZE = 20;

/** One page of a published article's comments: top-level ones oldest first, each with its whole reply tree. */
export const getArticleComments = async (articleId: number, page: number): Promise<ArticleCommentPageDto> => {
  const response = await apiClient.get<ArticleCommentPageDto>(`/articles/${articleId}/comments`, {
    params: { page, pageSize: COMMENTS_PAGE_SIZE },
  });
  return response.data;
};

/** Keyed by the signed-in email too: what the caller may do differs per user. */
export const articleCommentsQueryKey = (articleId: number, email: string | null) =>
  [APP_CONSTANTS.QUERY_KEYS.ARTICLE_COMMENTS, articleId, email] as const;

/** A new comment, or a reply when `parentId` is set. */
export const createArticleComment = async (articleId: number, comment: ArticleCommentCreateDto): Promise<ArticleCommentDto> => {
  const response = await apiClient.post<ArticleCommentDto>(`/articles/${articleId}/comments`, comment);
  return response.data;
};

/** The new text of the caller's own comment. */
export const updateArticleComment = async (commentId: number, body: string): Promise<ArticleCommentDto> => {
  const response = await apiClient.put<ArticleCommentDto>(`/comments/${commentId}`, { body });
  return response.data;
};

/** Deletes a comment softly: its author, or an admin any. */
export const deleteArticleComment = async (commentId: number): Promise<void> => {
  await apiClient.delete(`/comments/${commentId}`);
};
