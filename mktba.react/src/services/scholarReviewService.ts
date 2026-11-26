import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type { ScholarApplicationPageDto, ScholarApplicationReviewDto, ScholarApplicationStatus } from '../shared/types/ApiTypes';

export type ScholarApplicationFilter = {
  status?: ScholarApplicationStatus;
  page: number;
  pageSize: number;
};

/** One page of the scholar applications for review (V-02, #118), newest first; admins only. */
export const getScholarApplications = async (filter: ScholarApplicationFilter): Promise<ScholarApplicationPageDto> => {
  const response = await apiClient.get<ScholarApplicationPageDto>('/scholar-applications', {
    params: { status: filter.status, page: filter.page, pageSize: filter.pageSize },
  });
  return response.data;
};

export const scholarApplicationsQueryKey = (filter: ScholarApplicationFilter) =>
  [APP_CONSTANTS.QUERY_KEYS.SCHOLAR_APPLICATIONS, filter] as const;

/** One application with its applicant, documents and the decisions still open. */
export const getScholarApplicationReview = async (id: number): Promise<ScholarApplicationReviewDto> => {
  const response = await apiClient.get<ScholarApplicationReviewDto>(`/scholar-applications/${id}`);
  return response.data;
};

export const scholarApplicationReviewQueryKey = (id: number) =>
  [APP_CONSTANTS.QUERY_KEYS.SCHOLAR_APPLICATION_REVIEW, id] as const;

export type ScholarDecision = { kind: 'approve' } | { kind: 'reject' | 'revoke'; reason: string };

/** Approves, refuses (with a reason) or revokes (with a reason); answers with the application as it is now. */
export const decideScholarApplication = async (id: number, decision: ScholarDecision): Promise<ScholarApplicationReviewDto> => {
  const response = await apiClient.post<ScholarApplicationReviewDto>(
    `/scholar-applications/${id}/${decision.kind}`,
    decision.kind === 'approve' ? undefined : { reason: decision.reason },
  );
  return response.data;
};
