import apiClient from '../shared/api-client/ApiClient';
import type { UploadedImageDto } from '../shared/types/ApiTypes';

/**
 * Uploads an image for an article's text (U-08, `POST /uploads/images`): the server re-encodes it
 * as WebP of at most 2048 px; put the returned `url` into the text as `![alt](url)`.
 * `onProgress` gets the share of the file sent so far, 0…1; `signal` cancels the upload.
 */
export const uploadArticleImage = async (
  file: File,
  onProgress?: (share: number) => void,
  signal?: AbortSignal,
): Promise<UploadedImageDto> => {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.post<UploadedImageDto>('/uploads/images', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.min(1, event.loaded / event.total));
    },
  });
  return response.data;
};
