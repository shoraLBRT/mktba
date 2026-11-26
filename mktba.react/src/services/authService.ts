import apiClient from '../shared/api-client/ApiClient';
import type {
  AdminAuthResponseDto,
  AdminAuthStatusDto,
  AdminLoginRequestDto,
  AdminRegisterRequestDto,
  CurrentUserDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  ReaderSignUpRequestDto,
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

/** Opens a reader account (U-05, #126). Answers the same for a known address; does not sign in. */
export const signUp = async (payload: ReaderSignUpRequestDto): Promise<void> => {
  await apiClient.post('/auth/sign-up', payload);
};

/** Confirms the address with the token of the confirmation email's link. */
export const confirmEmail = async (token: string): Promise<void> => {
  await apiClient.post('/auth/confirm-email', { token });
};

/** Sends the signed-in user another confirmation email. */
export const resendConfirmation = async (): Promise<void> => {
  await apiClient.post('/auth/confirm-email/resend');
};

/** Asks for a password reset email; answers the same whether the address has an account or not. */
export const requestPasswordReset = async (payload: PasswordResetRequestDto): Promise<void> => {
  await apiClient.post('/auth/password-reset', payload);
};

/** Sets a new password with the token of the reset email's link; every session of the account ends. */
export const resetPassword = async (payload: PasswordResetConfirmDto): Promise<void> => {
  await apiClient.post('/auth/password-reset/confirm', payload);
};
