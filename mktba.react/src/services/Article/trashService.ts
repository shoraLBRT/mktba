import { APP_CONSTANTS } from '../../constants/AppConstants';
import apiClient from '../../shared/api-client/ApiClient';
import type { ArticleTrashItemDto } from '../../shared/types/ApiTypes';

/** Moves an article to the trash (M-11, #133); 400 `article_has_children` while it has children. */
export const moveArticleToTrash = async (id: number): Promise<void> => {
  await apiClient.delete(`/articles/${id}`);
};

/** The trashed articles, most recently trashed first. */
export const getArticleTrash = async (): Promise<ArticleTrashItemDto[]> => {
  const response = await apiClient.get<ArticleTrashItemDto[]>('/articles/trash');
  return response.data;
};

/** Takes an article out of the trash; 400 `article_parent_in_trash` while its parent is still there. */
export const restoreArticleFromTrash = async (id: number): Promise<void> => {
  await apiClient.post(`/articles/trash/${id}/restore`);
};

/** Deletes a trashed article for good. */
export const purgeArticle = async (id: number): Promise<void> => {
  await apiClient.delete(`/articles/trash/${id}`);
};

/** React Query key of the admin trash. */
export const TRASH_QUERY_KEY = [APP_CONSTANTS.QUERY_KEYS.ADMIN_TRASH] as const;
