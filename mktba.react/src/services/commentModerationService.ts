import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type {
  CommentBanCreateDto,
  CommentBanDto,
  CommentModerationAction,
  CommentModerationPageDto,
  CommentModerationQueue,
} from '../shared/types/ApiTypes';

/** Comments a queue page asks for. */
export const COMMENT_MODERATION_PAGE_SIZE = 20;

/** One page of a moderation queue (C-02, #128), with every queue's count; admins only. */
export const getCommentModerationQueue = async (queue: CommentModerationQueue, page: number): Promise<CommentModerationPageDto> => {
  const response = await apiClient.get<CommentModerationPageDto>('/comments/moderation', {
    params: { queue, page, pageSize: COMMENT_MODERATION_PAGE_SIZE },
  });
  return response.data;
};

export const commentModerationQueryKey = (queue: CommentModerationQueue, page: number) =>
  [APP_CONSTANTS.QUERY_KEYS.ADMIN_COMMENT_MODERATION, queue, page] as const;

/** Approves (publishes) or hides a comment. */
export const moderateComment = async (commentId: number, action: CommentModerationAction): Promise<void> => {
  await apiClient.post(`/comments/${commentId}/moderation`, { action });
};

/** The users barred from commenting now. */
export const getCommentBans = async (): Promise<CommentBanDto[]> => {
  const response = await apiClient.get<CommentBanDto[]>('/comments/bans');
  return response.data;
};

export const commentBansQueryKey = () => [APP_CONSTANTS.QUERY_KEYS.ADMIN_COMMENT_BANS] as const;

/** Bars a user from commenting for `days`, or for good (null); replaces their current ban. */
export const banCommenter = async (userId: number, ban: CommentBanCreateDto): Promise<CommentBanDto> => {
  const response = await apiClient.put<CommentBanDto>(`/comments/bans/${userId}`, ban);
  return response.data;
};

/** Lifts a user's comment ban. */
export const unbanCommenter = async (userId: number): Promise<void> => {
  await apiClient.delete(`/comments/bans/${userId}`);
};
