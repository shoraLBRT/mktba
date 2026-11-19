import apiClient from '../shared/api-client/ApiClient';
import type {
  AdminAuthResponseDto,
  AdminAuthStatusDto,
  AdminLoginRequestDto,
  AdminRegisterRequestDto,
  AdminInviteTokenCreateResponseDto,
  CurrentUserDto,
  SessionDto,
} from '../shared/types/ApiTypes';
import { clearSession, setSignedIn } from './session';

export const getAuthStatus = async (): Promise<AdminAuthStatusDto> => {
  const response = await apiClient.get<AdminAuthStatusDto>('/auth/status');
  return response.data;
};

/** The signed-in user with their current role (read from the database, not the token). */
export const getCurrentUser = async (): Promise<CurrentUserDto> => {
  const response = await apiClient.get<CurrentUserDto>('/auth/me');
  return response.data;
};

/** Signs in; the API sets the refresh cookie, so the request must accept cookies. */
export const adminLogin = async (payload: AdminLoginRequestDto): Promise<AdminAuthResponseDto> => {
  const response = await apiClient.post<AdminAuthResponseDto>('/auth/login', payload, { withCredentials: true });
  setSignedIn(response.data);
  return response.data;
};

export const adminRegister = async (payload: AdminRegisterRequestDto): Promise<AdminAuthResponseDto> => {
  const response = await apiClient.post<AdminAuthResponseDto>('/auth/register', payload, { withCredentials: true });
  setSignedIn(response.data);
  return response.data;
};

export const generateInviteToken = async (): Promise<AdminInviteTokenCreateResponseDto> => {
  const response = await apiClient.post<AdminInviteTokenCreateResponseDto>('/auth/invite-token');
  return response.data;
};

/** The signed-in user's devices, the current one marked. */
export const getSessions = async (): Promise<SessionDto[]> => {
  const response = await apiClient.get<SessionDto[]>('/auth/sessions');
  return response.data;
};

/** Signs one of the user's other devices out. */
export const endSession = async (sessionId: string): Promise<void> => {
  await apiClient.delete(`/auth/sessions/${sessionId}`);
};

/** Signs the user out on every device, this one included. */
export const logOutEverywhere = async (): Promise<void> => {
  await apiClient.post('/auth/logout-all', undefined, { withCredentials: true });
  clearSession();
};
