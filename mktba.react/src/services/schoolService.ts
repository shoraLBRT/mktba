import { articleLocaleQuery, DEFAULT_LANGUAGE, type Language } from '../localization/language';
import apiClient from '../shared/api-client/ApiClient';
import type { SchoolCreateDto, SchoolDto, SchoolUpdateDto } from '../shared/types/ApiTypes';

/**
 * The canonical schools named in a language (I-07, #111): the English names for `en`, the Russian ones
 * for the default language or for a school without a translation. Ids and slugs are the same in every
 * language; the query key is `[SYSTEM_SCHOOLS, language]`.
 */
export const getSystemSchools = async (language: Language = DEFAULT_LANGUAGE): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>(`/schools/system${articleLocaleQuery(language)}`);
  return response.data;
};

/** The scholar opinions of one article (M-08, #116): created for it or used by its opinions. */
export const getSchoolsByArticleId = async (articleId: number): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>(`/schools/article/${articleId}`);
  return response.data;
};

/** The directory of scholar opinions an author picks from (M-08, #116), by name. */
export const getScholarOpinions = async (): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>('/schools/custom');
  return response.data;
};

/** Creates a scholar opinion; the slug is left to the server. */
export const createCustomSchool = async (payload: SchoolCreateDto): Promise<SchoolDto> => {
  const response = await apiClient.post<SchoolDto>('/schools', payload);
  return response.data;
};

export const updateCustomSchool = async (id: number, payload: SchoolUpdateDto): Promise<SchoolDto> => {
  const response = await apiClient.put<SchoolDto>(`/schools/${id}`, payload);
  return response.data;
};

export const deleteCustomSchool = async (id: number): Promise<void> => {
  await apiClient.delete(`/schools/${id}`);
};
