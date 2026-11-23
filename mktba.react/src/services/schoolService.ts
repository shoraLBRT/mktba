import { articleLocaleQuery, DEFAULT_LANGUAGE, type Language } from '../localization/language';
import apiClient from '../shared/api-client/ApiClient';
import type { SchoolDto } from '../shared/types/ApiTypes';

export interface SchoolCreatePayload {
  slug: string;
  name: string;
  shortName: string;
  articleScopeId: number;
}

/**
 * The canonical schools named in a language (I-07, #111): the English names for `en`, the Russian ones
 * for the default language or for a school without a translation. Ids and slugs are the same in every
 * language; the query key is `[SYSTEM_SCHOOLS, language]`.
 */
export const getSystemSchools = async (language: Language = DEFAULT_LANGUAGE): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>(`/schools/system${articleLocaleQuery(language)}`);
  return response.data;
};

export const getSchoolsByArticleId = async (articleId: number): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>(`/schools/article/${articleId}`);
  return response.data;
};

export const createCustomSchool = async (payload: SchoolCreatePayload): Promise<SchoolDto> => {
  const response = await apiClient.post<SchoolDto>('/schools', payload);
  return response.data;
};

export const deleteCustomSchool = async (id: number): Promise<void> => {
  await apiClient.delete(`/schools/${id}`);
};
