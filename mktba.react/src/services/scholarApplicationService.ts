import apiClient from '../shared/api-client/ApiClient';
import { buildScholarApplicationForm, type ScholarApplicationDraft } from '../shared/scholarApplication';
import type { MyScholarApplicationDto, ScholarApplicationDto } from '../shared/types/ApiTypes';

/** The signed-in user's latest application for the scholar status and whether they may apply (V-01, #117). */
export const getMyScholarApplication = async (): Promise<MyScholarApplicationDto> => {
  const response = await apiClient.get<MyScholarApplicationDto>('/scholar-application');
  return response.data;
};

/** Sends a new application with its documents as one multipart form. */
export const submitScholarApplication = async (draft: ScholarApplicationDraft): Promise<ScholarApplicationDto> => {
  const response = await apiClient.post<ScholarApplicationDto>('/scholar-application', buildScholarApplicationForm(draft), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/** Withdraws the pending application; the server deletes its documents. */
export const withdrawScholarApplication = async (): Promise<MyScholarApplicationDto> => {
  const response = await apiClient.post<MyScholarApplicationDto>('/scholar-application/withdraw');
  return response.data;
};

/**
 * One document of the user's application. It has no public address, so it is fetched with the
 * user's token and handed over as a Blob for the browser to save.
 */
export const downloadScholarDocument = async (id: number): Promise<Blob> => {
  const response = await apiClient.get<Blob>(`/scholar-application/documents/${id}`, { responseType: 'blob' });
  return response.data;
};
