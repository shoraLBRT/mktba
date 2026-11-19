import apiClient from '../shared/api-client/ApiClient';
import type {
  InviteCreateRequestDto,
  InviteCreatedDto,
  InviteDto,
  UserRole,
  UserSummaryDto,
} from '../shared/types/ApiTypes';

/** Every invite, newest first, with its status (admin only; never carries a token). */
export const getInvites = async (): Promise<InviteDto[]> => {
  const response = await apiClient.get<InviteDto[]>('/invites');
  return response.data;
};

/** Creates a single-use invite for a role; the token is in this response only. */
export const createInvite = async (payload: InviteCreateRequestDto): Promise<InviteCreatedDto> => {
  const response = await apiClient.post<InviteCreatedDto>('/invites', payload);
  return response.data;
};

/** Withdraws an unused invite. */
export const revokeInvite = async (id: number): Promise<void> => {
  await apiClient.post(`/invites/${id}/revoke`);
};

/** Gives a user another role; the API refuses to demote the last admin. */
export const changeUserRole = async (id: number, role: UserRole): Promise<UserSummaryDto> => {
  const response = await apiClient.put<UserSummaryDto>(`/users/${id}/role`, { role });
  return response.data;
};
