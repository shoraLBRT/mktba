/**
 * User profiles on the client (U-07, #72): the limits and rules mirror `UserProfileRules` in
 * Mktba.Application, which validates whatever the form sends.
 */
import { isValidSocialImageUrl } from './seo';
import { isValidSlug, slugFromTitle } from './slug';
import type { UserProfileDto, UserProfileWriteDto } from './types/ApiTypes';

/** Longest display name (`MktbaDbContext.UserDisplayNameMaxLength`). */
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 100;
/** Longest "about" text (`MktbaDbContext.UserBioMaxLength`). */
export const PROFILE_BIO_MAX_LENGTH = 1000;
/** Longest degree (`MktbaDbContext.UserDegreeMaxLength`). */
export const PROFILE_DEGREE_MAX_LENGTH = 150;
/** Longest institution (`MktbaDbContext.UserInstitutionMaxLength`). */
export const PROFILE_INSTITUTION_MAX_LENGTH = 200;
/** Longest link label (`MktbaDbContext.UserLinkLabelMaxLength`). */
export const PROFILE_LINK_LABEL_MAX_LENGTH = 60;
/** Longest link address (`MktbaDbContext.UserLinkUrlMaxLength`). */
export const PROFILE_LINK_URL_MAX_LENGTH = 2048;
/** Most links a profile holds (`UserProfileRules.MaxLinks`). */
export const PROFILE_MAX_LINKS = 5;

/** The slug word for a name with nothing to transliterate (`UserProfileRules.SlugFallback`). */
const SLUG_FALLBACK = 'author';

export type ProfileLinkDraft = { label: string; url: string };

/** The profile form's inputs, as typed. */
export type ProfileDraft = {
  displayName: string;
  slug: string;
  avatarUrl: string;
  bio: string;
  degree: string;
  institution: string;
  links: ProfileLinkDraft[];
};

/** What is wrong with a draft, by field; the keys name messages of `profilePage.errors`. */
export type ProfileDraftError = 'slugNeedsName' | 'slugInvalid' | 'avatarUrlInvalid' | 'linkLabelRequired' | 'linkUrlInvalid';

export const profileDraftFromDto = (profile: UserProfileDto | undefined): ProfileDraft => ({
  displayName: profile?.displayName ?? '',
  slug: profile?.slug ?? '',
  avatarUrl: profile?.avatarUrl ?? '',
  bio: profile?.bio ?? '',
  degree: profile?.degree ?? '',
  institution: profile?.institution ?? '',
  links: (profile?.links ?? []).map((link) => ({ label: link.label, url: link.url })),
});

/** The slug the API derives from a display name: the article transliteration with the `author` fallback. */
export const profileSlugFromName = (displayName: string): string => slugFromTitle(displayName, SLUG_FALLBACK);

/** An absolute http(s) URL without whitespace: the only kind a profile link may be. */
export const isValidProfileLinkUrl = (value: string): boolean => {
  const url = value.trim();
  if (url.length === 0 || url.length > PROFILE_LINK_URL_MAX_LENGTH || /\s/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
};

/** A link row the user left completely empty is dropped on save rather than reported. */
const isBlankLink = (link: ProfileLinkDraft): boolean => link.label.trim() === '' && link.url.trim() === '';

/** The first problem the API would refuse the draft for, or null. Lengths are capped by the inputs. */
export const validateProfileDraft = (draft: ProfileDraft): ProfileDraftError | null => {
  const slug = draft.slug.trim().toLowerCase();
  if (slug !== '') {
    if (draft.displayName.trim() === '') return 'slugNeedsName';
    if (!isValidSlug(slug)) return 'slugInvalid';
  }

  if (!isValidSocialImageUrl(draft.avatarUrl)) return 'avatarUrlInvalid';

  for (const link of draft.links.filter((candidate) => !isBlankLink(candidate))) {
    if (link.label.trim() === '') return 'linkLabelRequired';
    if (!isValidProfileLinkUrl(link.url)) return 'linkUrlInvalid';
  }

  return null;
};

/** The draft as sent to the API: blanks become null, empty link rows are dropped. */
export const buildProfileDto = (draft: ProfileDraft): UserProfileWriteDto => ({
  displayName: draft.displayName.trim() || null,
  slug: draft.slug.trim().toLowerCase() || null,
  avatarUrl: draft.avatarUrl.trim() || null,
  bio: draft.bio.trim() || null,
  degree: draft.degree.trim() || null,
  institution: draft.institution.trim() || null,
  links: draft.links
    .filter((link) => !isBlankLink(link))
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
});
