import apiClient from '../shared/api-client/ApiClient';
import type { FeedbackAcceptedDto, FeedbackCreateDto } from '../shared/types/ApiTypes';

/** Sends a visitor's message (`POST /feedback`, public); the answer carries the message number. */
export const sendFeedback = async (payload: FeedbackCreateDto): Promise<FeedbackAcceptedDto> => {
  const response = await apiClient.post<FeedbackAcceptedDto>('/feedback', payload);
  return response.data;
};
