import apiClient from '../shared/api-client/ApiClient';
import type {
  AdminCleanupResultDto,
  AiConnectionCheckResultDto,
  AiProviderSettingsDto,
  AiStyleRequestDto,
  AiStyleResponseDto,
  ArticleCreateDto,
  ArticleReadDto,
  UpdateAiProviderSettingsDto,
} from '../shared/types/ApiTypes';

export const getArticles = async (): Promise<ArticleReadDto[]> => {
  const response = await apiClient.get<ArticleReadDto[]>('/articles');
  return response.data;
};

export const createArticle = async (dto: ArticleCreateDto): Promise<ArticleReadDto> => {
  const response = await apiClient.post<ArticleReadDto>('/articles/', dto);
  return response.data;
};

export const deleteArticle = async (id: number): Promise<void> => {
  await apiClient.delete(`/articles/${id}`);
};

export const deleteParagraph = async (id: number): Promise<void> => {
  await apiClient.delete(`/paragraph/${id}`);
};

export const cleanupDemoData = async (): Promise<AdminCleanupResultDto> => {
  const response = await apiClient.post<AdminCleanupResultDto>('/admin/cleanup');
  return response.data;
};

export const getAiProviderSettings = async (): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.get<AiProviderSettingsDto>('/admin/ai-settings');
  return response.data;
};

export const updateAiProviderSettings = async (payload: UpdateAiProviderSettingsDto): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.put<AiProviderSettingsDto>('/admin/ai-settings', payload);
  return response.data;
};

export const styleMarkdownWithAi = async (payload: AiStyleRequestDto): Promise<AiStyleResponseDto> => {
  const response = await apiClient.post<AiStyleResponseDto>('/admin/ai-style', payload, { timeout: 120_000 });
  return response.data;
};

export const resetAiSettings = async (): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.delete<AiProviderSettingsDto>('/admin/ai-settings');
  return response.data;
};

export const checkAiConnection = async (): Promise<AiConnectionCheckResultDto> => {
  const response = await apiClient.post<AiConnectionCheckResultDto>('/admin/ai-check');
  return response.data;
};
