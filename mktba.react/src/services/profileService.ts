import apiClient from '../shared/api-client/ApiClient';
import type { UploadedImageDto, UserActivityDto, UserProfileDto, UserProfileWriteDto } from '../shared/types/ApiTypes';

/** The signed-in user's profile (U-07); every field is empty until they fill it in. */
export const getMyProfile = async (): Promise<UserProfileDto> => {
  const response = await apiClient.get<UserProfileDto>('/profile');
  return response.data;
};

/** Replaces the signed-in user's whole profile; a blank value clears its field. */
export const updateMyProfile = async (payload: UserProfileWriteDto): Promise<UserProfileDto> => {
  const response = await apiClient.put<UserProfileDto>('/profile', payload);
  return response.data;
};

/**
 * Uploads an avatar image (U-08); the profile is not changed — put the returned `url` into
 * `avatarUrl` and save the profile.
 */
export const uploadAvatar = async (file: File): Promise<UploadedImageDto> => {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.post<UploadedImageDto>('/uploads/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * The signed-in user's own edits and publications by UTC week (P-04), oldest week first; the last
 * one is the current week so far.
 */
export const getMyActivity = async (weeks?: number): Promise<UserActivityDto> => {
  const response = await apiClient.get<UserActivityDto>('/profile/activity', { params: weeks ? { weeks } : undefined });
  return response.data;
};
