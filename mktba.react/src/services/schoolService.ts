import apiClient from '../shared/api-client/ApiClient';
import type { SchoolDto } from '../shared/types/ApiTypes';

export interface SchoolCreatePayload {
  slug: string;
  name: string;
  shortName: string;
  articleScopeId: number;
}

export const getSystemSchools = async (): Promise<SchoolDto[]> => {
  const response = await apiClient.get<SchoolDto[]>('/schools/system');
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
