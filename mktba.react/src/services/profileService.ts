import apiClient from '../shared/api-client/ApiClient';
import type { UserProfileDto, UserProfileWriteDto } from '../shared/types/ApiTypes';

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
