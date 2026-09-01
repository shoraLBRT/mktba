export interface OpinionDto {
  id: number;
  content: string;
  isDefault: boolean;
  schoolIds: number[];
}

export interface ParagraphDto {
  id: number;
  order: number;
  opinions: OpinionDto[];
}

export interface OpinionCreateDto {
  content: string;
  isDefault: boolean;
  schoolIds: number[];
}

export interface ParagraphCreateDto {
  articleId: number;
  order: number;
  opinions: OpinionCreateDto[];
}

export interface ParagraphReadDto {
  id: number;
  articleId: number;
  order: number;
  opinions: OpinionDto[];
}

export interface SchoolDto {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  isSystem: boolean;
  articleScopeId?: number;
}

export interface ArticleInfoboxFieldDto {
  id: number;
  order: number;
  key: string;
  label: string;
  value: string;
}

export interface ArticleInfoboxDto {
  title?: string;
  subtitle?: string;
  fields: ArticleInfoboxFieldDto[];
}

export interface ArticleInfoboxFieldCreateDto {
  order: number;
  key: string;
  label: string;
  value: string;
}

export interface ArticleInfoboxCreateDto {
  title?: string;
  subtitle?: string;
  fields: ArticleInfoboxFieldCreateDto[];
}

export interface ArticleRelatedLinkDto {
  id: number;
  relatedArticleId: number;
  relatedArticleTitle: string;
  order: number;
}

export interface ArticleRelatedLinkCreateDto {
  relatedArticleId: number;
  order: number;
}

export interface ArticleContentDto {
  id: number;
  title: string;
  paragraphs: ParagraphDto[];
  infobox?: ArticleInfoboxDto;
  summary?: string;
  tags: string[];
  relatedLinks?: ArticleRelatedLinkDto[];
}

export interface ArticleContentCreateDto {
  title: string;
  parentArticleId?: number;
  paragraphs: ParagraphCreateDto[];
  infobox?: ArticleInfoboxCreateDto;
  summary?: string;
  tags?: string[];
  relatedLinks?: ArticleRelatedLinkCreateDto[];
}

export interface ArticleReadDto {
  id: number;
  title: string;
  parentArticleId?: number;
  hasContent: boolean;
}

export interface AdminCleanupResultDto {
  deletedArticles: number;
  deletedParagraphs: number;
  message: string;
}

export interface AiProviderSettingsDto {
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  markdownStylingSystemPrompt?: string;
}

export interface UpdateAiProviderSettingsDto {
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  apiKey?: string;
  markdownStylingSystemPrompt?: string | null;
}

export interface AiStyleRequestDto {
  text: string;
}

export interface AiStyleResponseDto {
  styledText: string;
}

export interface AiConnectionCheckResultDto {
  message: string;
  styledText: string;
}

export interface NavigationArticleDto {
  id: number;
  title: string;
  parentArticleId?: number;
  hasContent: boolean;
  children?: NavigationArticleDto[];
}

export type NavigationTreeDto = NavigationArticleDto[];

export interface AdminAuthStatusDto {
  requiresBootstrapAdmin: boolean;
}

export interface AdminRegisterRequestDto {
  email: string;
  password: string;
  inviteToken?: string;
}

export interface AdminLoginRequestDto {
  email: string;
  password: string;
}

export interface AdminAuthResponseDto {
  accessToken: string;
  expiresAtUtc: string;
  email: string;
}

export interface AdminInviteTokenCreateResponseDto {
  token: string;
  expiresAtUtc: string;
}
