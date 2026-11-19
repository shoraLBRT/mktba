// Contract types generated from the backend OpenAPI document (src/shared/api/openapi.json).
// Do not declare DTOs by hand: run `npm run gen:api` after changing the API and alias the schema here.
import type { components } from '../api/schema';

type Schemas = components['schemas'];

export type OpinionDto = Schemas['OpinionDto'];
export type ParagraphDto = Schemas['ParagraphDto'];
export type OpinionCreateDto = Schemas['OpinionCreateDto'];
export type ParagraphCreateDto = Schemas['ParagraphCreateDto'];
export type ParagraphReadDto = Schemas['ParagraphReadDto'];
export type SchoolDto = Schemas['SchoolDto'];
export type ArticleInfoboxFieldDto = Schemas['ArticleInfoboxFieldDto'];
export type ArticleInfoboxDto = Schemas['ArticleInfoboxDto'];
export type ArticleInfoboxFieldCreateDto = Schemas['ArticleInfoboxFieldCreateDto'];
export type ArticleInfoboxCreateDto = Schemas['ArticleInfoboxCreateDto'];
export type ArticleRelatedLinkDto = Schemas['ArticleRelatedLinkDto'];
export type ArticleRelatedLinkCreateDto = Schemas['ArticleRelatedLinkCreateDto'];
export type ArticleContentDto = Schemas['ArticleContentDto'];
export type ArticleContentCreateDto = Schemas['ArticleContentCreateDto'];
export type ArticleSeoDto = Schemas['ArticleSeoDto'];
export type ArticleMetaDto = Schemas['ArticleMetaDto'];
export type ArticleReadDto = Schemas['ArticleReadDto'];
export type ArticleStatus = Schemas['ArticleStatus'];
export type ArticleCreateDto = Schemas['ArticleCreateDto'];
export type ArticleMoveDto = Schemas['ArticleMoveDto'];
export type ArticleAuthorsDto = Schemas['ArticleAuthorsDto'];
export type UserSummaryDto = Schemas['UserSummaryDto'];
export type ArticleRevisionSummaryDto = Schemas['ArticleRevisionSummaryDto'];
export type ArticleRevisionDto = Schemas['ArticleRevisionDto'];
export type ArticleRevisionComparisonDto = Schemas['ArticleRevisionComparisonDto'];
export type ArticleSnapshotDto = Schemas['ArticleSnapshotDto'];
export type AdminCleanupResultDto = Schemas['AdminCleanupResultDto'];
export type AiProviderSettingsDto = Schemas['AiProviderSettingsDto'];
export type UpdateAiProviderSettingsDto = Schemas['UpdateAiProviderSettingsDto'];
export type AiStyleRequestDto = Schemas['AiStyleRequestDto'];
export type AiStyleResponseDto = Schemas['AiStyleResponseDto'];
export type AiConnectionCheckResultDto = Schemas['AiConnectionCheckResultDto'];
export type NavigationArticleDto = Schemas['NavigationArticleDto'];
export type AdminAuthStatusDto = Schemas['AdminAuthStatusDto'];
export type AdminRegisterRequestDto = Schemas['AdminRegisterRequestDto'];
export type AdminLoginRequestDto = Schemas['AdminLoginRequestDto'];
export type AdminAuthResponseDto = Schemas['AdminAuthResponseDto'];
export type AdminInviteTokenCreateResponseDto = Schemas['AdminInviteTokenCreateResponseDto'];
export type CurrentUserDto = Schemas['CurrentUserDto'];
export type SessionDto = Schemas['SessionDto'];
export type UserRole = Schemas['UserRole'];

export type NavigationTreeDto = NavigationArticleDto[];
