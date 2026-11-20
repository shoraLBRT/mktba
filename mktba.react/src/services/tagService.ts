import apiClient from '../shared/api-client/ApiClient';
import { TAG_PAGE_PARAM } from '../shared/tag';
import type { TagDto, TagMergeDto, TagPageDto, TagRenameDto } from '../shared/types/ApiTypes';

/** A tag and one page of the articles carrying it that a reader can open (M-06, #70); 404 `tag_not_found` otherwise. */
export const getTagPage = async (slug: string, page: number): Promise<TagPageDto> => {
  const response = await apiClient.get<TagPageDto>(`/tags/${encodeURIComponent(slug)}`, {
    params: { [TAG_PAGE_PARAM]: page },
  });
  return response.data;
};

/** Every tag with its article count, for the admin. */
export const getTags = async (): Promise<TagDto[]> => {
  const response = await apiClient.get<TagDto[]>('/tags');
  return response.data;
};

/** Renames a tag (and optionally its slug) on every article carrying it. */
export const renameTag = async (id: number, dto: TagRenameDto): Promise<TagDto> => {
  const response = await apiClient.put<TagDto>(`/tags/${id}`, dto);
  return response.data;
};

/** Merges tag `id` into `dto.intoTagId` and deletes it; answers the remaining tag. */
export const mergeTag = async (id: number, dto: TagMergeDto): Promise<TagDto> => {
  const response = await apiClient.post<TagDto>(`/tags/${id}/merge`, dto);
  return response.data;
};
