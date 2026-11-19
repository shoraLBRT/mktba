/**
 * Article SEO fields on the client (M-10, #28): the limits and image-URL rule mirror
 * `ArticleSeo` in Mktba.Application, which validates whatever the editor sends.
 */
import type { ArticleSeoDto } from './types/ApiTypes';

/** Longest SEO title the API accepts (`MktbaDbContext.SeoTitleMaxLength`). */
export const SEO_TITLE_MAX_LENGTH = 70;
/** Longest SEO description the API accepts (`MktbaDbContext.SeoDescriptionMaxLength`). */
export const SEO_DESCRIPTION_MAX_LENGTH = 160;
/** Longest social image URL the API accepts (`MktbaDbContext.SocialImageUrlMaxLength`). */
export const SOCIAL_IMAGE_URL_MAX_LENGTH = 2048;

/** The editor's SEO inputs, as typed. */
export type SeoDraft = {
  title: string;
  description: string;
  socialImageUrl: string;
  noIndex: boolean;
};

export const emptySeoDraft = (): SeoDraft => ({ title: '', description: '', socialImageUrl: '', noIndex: false });

export const seoDraftFromDto = (seo: ArticleSeoDto | null | undefined): SeoDraft => ({
  title: seo?.title ?? '',
  description: seo?.description ?? '',
  socialImageUrl: seo?.socialImageUrl ?? '',
  noIndex: seo?.noIndex ?? false,
});

/** The draft as sent to the API: blanks become null. */
export const buildSeoDto = (draft: SeoDraft): ArticleSeoDto => ({
  title: draft.title.trim() || null,
  description: draft.description.trim() || null,
  socialImageUrl: draft.socialImageUrl.trim() || null,
  noIndex: draft.noIndex,
});

/** An absolute http(s) URL or a site-relative path ("/x", not "//host"); blank counts as valid (no image). */
export const isValidSocialImageUrl = (value: string): boolean => {
  const url = value.trim();
  if (url.length === 0) return true;
  if (url.length > SOCIAL_IMAGE_URL_MAX_LENGTH || /\s/.test(url)) return false;
  if (url.startsWith('/')) return !url.startsWith('//') && !url.includes('\\');
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
};

/** An absolute URL for og:image / canonical: site-relative paths are resolved against `origin`. */
export const toAbsoluteUrl = (urlOrPath: string, origin: string): string =>
  urlOrPath.startsWith('/') ? new URL(urlOrPath, origin).toString() : urlOrPath;
