import apiClient from '../../shared/api-client/ApiClient';
import type { ArticleDraftDto } from '../../shared/types/ApiTypes';

/** `/articles/{id}/draft`, or `/articles/draft` for the new-article page (`articleId` null). */
const draftPath = (articleId: number | null): string =>
  articleId === null ? '/articles/draft' : `/articles/${articleId}/draft`;

/** The signed-in user's own autosaved draft (E-02, #75), or null when there is none (204). */
export const getArticleDraft = async (articleId: number | null): Promise<ArticleDraftDto | null> => {
  const response = await apiClient.get<ArticleDraftDto | ''>(draftPath(articleId));
  return response.status === 204 || !response.data ? null : response.data;
};

/** Writes the user's draft over the one there was. */
export const saveArticleDraft = async (
  articleId: number | null,
  snapshot: object,
  baseUpdatedAt: string | null,
): Promise<ArticleDraftDto> => {
  const response = await apiClient.put<ArticleDraftDto>(draftPath(articleId), { snapshot, baseUpdatedAt });
  return response.data;
};

/** Deletes the user's draft; also fine when there is none. */
export const deleteArticleDraft = async (articleId: number | null): Promise<void> => {
  await apiClient.delete(draftPath(articleId));
};
