import { APP_CONSTANTS } from '../constants/AppConstants';
import apiClient from '../shared/api-client/ApiClient';
import type {
  ArticleRemarkCreateDto,
  ArticleRemarkDto,
  ArticleRemarkListDto,
  ArticleRemarkStatus,
  ScholarRemarkHistoryPageDto,
} from '../shared/types/ApiTypes';

/** The remarks on an article the caller may see (V-06, #122): all for its authors and editors, a scholar's own. */
export const getArticleRemarks = async (articleId: number): Promise<ArticleRemarkListDto> => {
  const response = await apiClient.get<ArticleRemarkListDto>(`/articles/${articleId}/remarks`);
  return response.data;
};

export const articleRemarksQueryKey = (articleId: number) => [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REMARKS, articleId] as const;

/** The caller's own remarks across articles (V-07, #123): `open` true the open ones, false the closed ones, null all. */
export const getMyRemarks = async (open: boolean | null, page: number, pageSize: number): Promise<ScholarRemarkHistoryPageDto> => {
  const response = await apiClient.get<ScholarRemarkHistoryPageDto>('/article-remarks/mine', {
    params: { open: open ?? undefined, page, pageSize },
  });
  return response.data;
};

export const myRemarksQueryKey = (open: boolean | null, page: number) =>
  [APP_CONSTANTS.QUERY_KEYS.ARTICLE_REMARKS, 'mine', open, page] as const;

/** A verified scholar's remark on a block of the revision they read. */
export const createArticleRemark = async (articleId: number, remark: ArticleRemarkCreateDto): Promise<ArticleRemarkDto> => {
  const response = await apiClient.post<ArticleRemarkDto>(`/articles/${articleId}/remarks`, remark);
  return response.data;
};

export const replyToArticleRemark = async (remarkId: number, body: string): Promise<ArticleRemarkDto> => {
  const response = await apiClient.post<ArticleRemarkDto>(`/article-remarks/${remarkId}/messages`, { body });
  return response.data;
};

/** The authors or an editor close a remark: fixed (`Resolved`) or without a change (`Closed`). */
export const closeArticleRemark = async (
  remarkId: number,
  outcome: Exclude<ArticleRemarkStatus, 'Open'>,
  message: string | null,
): Promise<ArticleRemarkDto> => {
  const response = await apiClient.post<ArticleRemarkDto>(`/article-remarks/${remarkId}/close`, { outcome, message });
  return response.data;
};

export const reopenArticleRemark = async (remarkId: number, message: string | null): Promise<ArticleRemarkDto> => {
  const response = await apiClient.post<ArticleRemarkDto>(`/article-remarks/${remarkId}/reopen`, { message });
  return response.data;
};
