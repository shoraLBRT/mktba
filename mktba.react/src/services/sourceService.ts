import apiClient from '../shared/api-client/ApiClient';
import type { SourceDto, SourceWriteDto } from '../shared/types/ApiTypes';

/** Entries of the directory of sources whose title or author contains `query`; blank lists it from the start. */
export const searchSources = async (query: string, limit = 8): Promise<SourceDto[]> => {
  const trimmed = query.trim();
  const response = await apiClient.get<SourceDto[]>('/sources', {
    params: trimmed ? { q: trimmed, limit } : { limit },
  });
  return response.data;
};

/** Adds an entry to the directory. The same kind, title and author again fails with `source_duplicate`. */
export const createSource = async (payload: SourceWriteDto): Promise<SourceDto> => {
  const response = await apiClient.post<SourceDto>('/sources', payload);
  return response.data;
};
