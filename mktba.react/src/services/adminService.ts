import apiClient from '../shared/api-client/ApiClient';
import type {
  AdminCleanupResultDto,
  AiConnectionCheckResultDto,
  AiProviderSettingsDto,
  AiStyleRequestDto,
  AiStyleResponseDto,
  ArticleAuthorsDto,
  ArticleBulkResultDto,
  ArticleBulkStatusDto,
  ArticleCreateDto,
  ArticleListPageDto,
  ArticleMoveDto,
  ArticleUpdateDto,
  ArticleReadDto,
  ArticleStatus,
  ArticleSummaryDto,
  AuthorAnalyticsDto,
  SearchAnalyticsDto,
  SiteAnalyticsDto,
  ReviewQueueItemDto,
  UpdateAiProviderSettingsDto,
  UserSummaryDto,
} from '../shared/types/ApiTypes';
import type { ArticleListParams } from '../shared/articleListParams';

/** The dashboard's article counts (A-07): counted by the API, no article is loaded. */
export const getArticleSummary = async (): Promise<ArticleSummaryDto> => {
  const response = await apiClient.get<ArticleSummaryDto>('/articles/summary');
  return response.data;
};

export const getArticleById = async (id: number): Promise<ArticleReadDto> => {
  const response = await apiClient.get<ArticleReadDto>(`/articles/${id}`);
  return response.data;
};

/**
 * Moves the article to another status; the API rejects moves its transition table does not allow.
 * The comment is kept with the move (A-04: a reviewer's reason for returning the article).
 */
export const changeArticleStatus = async (id: number, status: ArticleStatus, comment?: string): Promise<ArticleReadDto> => {
  const response = await apiClient.post<ArticleReadDto>(`/articles/${id}/status`, { status, comment: comment?.trim() || null });
  return response.data;
};

/** The moderation queue (A-04): every article waiting for review, submitted longest ago first (reviewers only). */
export const getReviewQueue = async (): Promise<ReviewQueueItemDto[]> => {
  const response = await apiClient.get<ReviewQueueItemDto[]>('/articles/review-queue');
  return response.data;
};

/** Every user with their role, for choosing article authors and managing roles (admin only: the list carries emails). */
export const getUsers = async (): Promise<UserSummaryDto[]> => {
  const response = await apiClient.get<UserSummaryDto[]>('/users');
  return response.data;
};

export const getArticleAuthors = async (id: number): Promise<ArticleAuthorsDto> => {
  const response = await apiClient.get<ArticleAuthorsDto>(`/articles/${id}/authors`);
  return response.data;
};

/** Replaces the author and co-authors; the API rejects the author listed as a co-author. */
export const setArticleAuthors = async (id: number, dto: ArticleAuthorsDto): Promise<ArticleAuthorsDto> => {
  const response = await apiClient.put<ArticleAuthorsDto>(`/articles/${id}/authors`, dto);
  return response.data;
};

export const createArticle = async (dto: ArticleCreateDto): Promise<ArticleReadDto> => {
  const response = await apiClient.post<ArticleReadDto>('/articles/', dto);
  return response.data;
};

/**
 * Moves the article under another parent (null for the top level) at a 0-based index among its
 * new siblings; a null index appends. The API rejects its own subtree as the parent.
 */
export const moveArticle = async (id: number, dto: ArticleMoveDto): Promise<ArticleReadDto> => {
  const response = await apiClient.post<ArticleReadDto>(`/articles/${id}/move`, dto);
  return response.data;
};

/**
 * Renames the article (`PUT /articles/{id}`). The DTO also sets the parent, so a rename sends the
 * current one; the slug is kept and no revision is written.
 */
export const updateArticle = async (id: number, dto: ArticleUpdateDto): Promise<void> => {
  await apiClient.put(`/articles/${id}`, dto);
};

/** One page of the admin article list; only the filters that are set are sent. */
export const getArticleList = async (params: ArticleListParams): Promise<ArticleListPageDto> => {
  const response = await apiClient.get<ArticleListPageDto>('/articles/admin-list', {
    params: {
      search: params.search || undefined,
      status: params.status ?? undefined,
      authorId: params.authorId ?? undefined,
      tag: params.tag || undefined,
      locale: params.locale || undefined,
      sort: params.sort,
      dir: params.dir,
      page: params.page,
      pageSize: params.pageSize,
    },
  });
  return response.data;
};

/**
 * One page of the signed-in user's own articles — written or co-written (P-02, #90), newest edit
 * first; each item carries its latest status move, so a reviewer's comment can be shown.
 */
export const getMyArticles = async (status: ArticleStatus | null, page: number): Promise<ArticleListPageDto> => {
  const response = await apiClient.get<ArticleListPageDto>('/articles/admin-list', {
    params: { mine: true, status: status ?? undefined, page, pageSize: MY_ARTICLES_PAGE_SIZE },
  });
  return response.data;
};

export const MY_ARTICLES_PAGE_SIZE = 20;

/** Moves each article to the status on its own; the result says per article whether it moved and, if not, why. */
export const bulkChangeArticleStatus = async (dto: ArticleBulkStatusDto): Promise<ArticleBulkResultDto> => {
  const response = await apiClient.post<ArticleBulkResultDto>('/articles/bulk/status', dto);
  return response.data;
};

export const deleteArticle = async (id: number): Promise<void> => {
  await apiClient.delete(`/articles/${id}`);
};

export const deleteParagraph = async (id: number): Promise<void> => {
  await apiClient.delete(`/paragraph/${id}`);
};

export const cleanupDemoData = async (): Promise<AdminCleanupResultDto> => {
  const response = await apiClient.post<AdminCleanupResultDto>('/admin/cleanup');
  return response.data;
};

export const getAiProviderSettings = async (): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.get<AiProviderSettingsDto>('/admin/ai-settings');
  return response.data;
};

export const updateAiProviderSettings = async (payload: UpdateAiProviderSettingsDto): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.put<AiProviderSettingsDto>('/admin/ai-settings', payload);
  return response.data;
};

export const styleMarkdownWithAi = async (payload: AiStyleRequestDto): Promise<AiStyleResponseDto> => {
  const response = await apiClient.post<AiStyleResponseDto>('/admin/ai-style', payload, { timeout: 120_000 });
  return response.data;
};

export const resetAiSettings = async (): Promise<AiProviderSettingsDto> => {
  const response = await apiClient.delete<AiProviderSettingsDto>('/admin/ai-settings');
  return response.data;
};

export const checkAiConnection = async (): Promise<AiConnectionCheckResultDto> => {
  const response = await apiClient.post<AiConnectionCheckResultDto>('/admin/ai-check');
  return response.data;
};

/** The admin dashboard's site-wide statistics (N-05): the last `days` UTC days, today included. */
export const getSiteAnalytics = async (days: number): Promise<SiteAnalyticsDto> => {
  const response = await apiClient.get<SiteAnalyticsDto>('/analytics/site', { params: { days } });
  return response.data;
};

/** The search analytics of the admin dashboard (N-06): popular queries and those that found nothing, over the last `days` UTC days. */
export const getSearchAnalytics = async (days: number): Promise<SearchAnalyticsDto> => {
  const response = await apiClient.get<SearchAnalyticsDto>('/analytics/search', { params: { days } });
  return response.data;
};

/** The author dashboard (P-03): the signed-in user's own articles over the last `days` UTC days, today included. */
export const getAuthorAnalytics = async (days: number): Promise<AuthorAnalyticsDto> => {
  const response = await apiClient.get<AuthorAnalyticsDto>('/analytics/me', { params: { days } });
  return response.data;
};
