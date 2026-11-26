import apiClient from '../shared/api-client/ApiClient';
import type {
  NotificationPageDto,
  NotificationSettingsDto,
  NotificationSettingsWriteDto,
  NotificationUnreadCountDto,
} from '../shared/types/ApiTypes';

/** One page of the signed-in user's notifications, newest first (V-09, #125). */
export const getNotifications = async (params: { unread?: boolean; page?: number } = {}): Promise<NotificationPageDto> => {
  const response = await apiClient.get<NotificationPageDto>('/notifications', {
    params: { unread: params.unread || undefined, page: params.page && params.page > 1 ? params.page : undefined },
  });
  return response.data;
};

/** How many notifications are unread: the counter on the header's bell. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  const response = await apiClient.get<NotificationUnreadCountDto>('/notifications/unread-count');
  return response.data.unread;
};

export const markNotificationRead = async (id: number): Promise<void> => {
  await apiClient.post(`/notifications/${id}/read`);
};

export const markAllNotificationsRead = async (): Promise<void> => {
  await apiClient.post('/notifications/read-all');
};

/** Which categories also come by email; in-app notifications are always on. */
export const getNotificationSettings = async (): Promise<NotificationSettingsDto> => {
  const response = await apiClient.get<NotificationSettingsDto>('/notifications/settings');
  return response.data;
};

export const updateNotificationSettings = async (payload: NotificationSettingsWriteDto): Promise<NotificationSettingsDto> => {
  const response = await apiClient.put<NotificationSettingsDto>('/notifications/settings', payload);
  return response.data;
};
