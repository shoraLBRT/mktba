import { describe, expect, it } from 'vitest';
import {
  buildProfileDto,
  effectiveProfileSlug,
  findProfileDraftProblems,
  isValidProfileLinkUrl,
  profileDraftFromDto,
  profileFieldOfApiError,
  profileSlugFromName,
  type ProfileDraft,
} from './profile';

const draft = (patch: Partial<ProfileDraft> = {}): ProfileDraft => ({
  displayName: 'Иван Иванов',
  slug: '',
  avatarUrl: '',
  bio: '',
  degree: '',
  institution: '',
  links: [],
  ...patch,
});

// The same cases as UserProfileRulesTests in Mktba.Application.Tests: both sides must agree.
describe('profileSlugFromName', () => {
  it.each([
    ['Иван Иванов', 'ivan-ivanov'],
    ['ʿАбдуллах аль-Фулян', 'abdullakh-al-fulyan'],
    ['محمد', 'author'],
    ['1446', 'author-1446'],
  ])('given %j, then returns %j', (name, expected) => {
    expect(profileSlugFromName(name)).toBe(expected);
  });
});

describe('isValidProfileLinkUrl', () => {
  it.each(['https://example.com/me', 'http://example.com'])('given %j, then it is valid', (url) => {
    expect(isValidProfileLinkUrl(url)).toBe(true);
  });

  it.each(['', '/relative/path', 'javascript:alert(1)', 'mailto:someone@example.com', 'https://exa mple.com', 'example.com'])(
    'given %j, then it is not valid',
    (url) => {
      expect(isValidProfileLinkUrl(url)).toBe(false);
    },
  );
});

describe('findProfileDraftProblems', () => {
  it('given a full valid draft, then there is no problem', () => {
    expect(
      findProfileDraftProblems(
        draft({ slug: 'Ivan-Ivanov', avatarUrl: '/media/ivan.png', links: [{ label: 'Сайт', url: 'https://example.com' }] }),
      ),
    ).toEqual({});
  });

  it('given a slug without a name, then the name is needed', () => {
    expect(findProfileDraftProblems(draft({ displayName: ' ', slug: 'ivan' }))).toEqual({ slug: 'slugNeedsName' });
  });

  it.each(['иван', 'ivan--ivanov', '12345', 'ivan ivanov'])('given the slug %j, then it is invalid', (slug) => {
    expect(findProfileDraftProblems(draft({ slug }))).toEqual({ slug: 'slugInvalid' });
  });

  it('given an avatar that is neither http(s) nor a site path, then it is invalid', () => {
    expect(findProfileDraftProblems(draft({ avatarUrl: 'javascript:alert(1)' }))).toEqual({ avatarUrl: 'avatarUrlInvalid' });
  });

  it('given several bad fields, then names each of them by its row, in the form order', () => {
    const problems = findProfileDraftProblems(
      draft({
        slug: 'иван',
        avatarUrl: 'ftp://x',
        links: [
          { label: 'Сайт', url: 'https://example.com' },
          { label: '', url: 'example.com' },
        ],
      }),
    );

    expect(problems).toEqual({
      slug: 'slugInvalid',
      avatarUrl: 'avatarUrlInvalid',
      linkLabel1: 'linkLabelRequired',
      linkUrl1: 'linkUrlInvalid',
    });
    expect(Object.keys(problems)[0]).toBe('slug');
  });

  it('given a completely empty link row, then it is ignored', () => {
    expect(findProfileDraftProblems(draft({ links: [{ label: ' ', url: '' }] }))).toEqual({});
  });
});

describe('effectiveProfileSlug', () => {
  it('given no name, then there is no address', () => {
    expect(effectiveProfileSlug(draft({ displayName: ' ', slug: 'ivan' }), 'ivan')).toBeNull();
  });

  it('given a typed slug, then it wins over the saved one, lower-cased', () => {
    expect(effectiveProfileSlug(draft({ slug: ' Ivan ' }), 'old')).toBe('ivan');
  });

  it('given a blank slug, then the saved one is kept, else the name is transliterated', () => {
    expect(effectiveProfileSlug(draft(), 'old')).toBe('old');
    expect(effectiveProfileSlug(draft(), null)).toBe('ivan-ivanov');
  });
});

describe('profileFieldOfApiError', () => {
  it.each([
    ['profile_slug_taken', 'slug'],
    ['profile_slug_invalid', 'slug'],
    ['profile_display_name_required', 'slug'],
    ['profile_avatar_url_invalid', 'avatarUrl'],
    ['profile_links_too_many', null],
    [undefined, null],
  ])('given %j, then the field is %j', (code, field) => {
    expect(profileFieldOfApiError(code)).toBe(field);
  });
});

describe('buildProfileDto', () => {
  it('given a draft, then trims values, turns blanks into null and drops empty link rows', () => {
    expect(
      buildProfileDto(
        draft({
          displayName: '  Иван Иванов ',
          slug: ' Ivan ',
          bio: '   ',
          links: [
            { label: ' Сайт ', url: ' https://example.com ' },
            { label: '', url: '' },
          ],
        }),
      ),
    ).toEqual({
      displayName: 'Иван Иванов',
      slug: 'ivan',
      avatarUrl: null,
      bio: null,
      degree: null,
      institution: null,
      links: [{ label: 'Сайт', url: 'https://example.com' }],
    });
  });
});

describe('profileDraftFromDto', () => {
  it('given no profile yet, then every input is empty', () => {
    expect(profileDraftFromDto(undefined)).toEqual(draft({ displayName: '' }));
  });

  it('given a saved profile, then fills the inputs from it', () => {
    expect(
      profileDraftFromDto({
        userId: 1,
        role: 'Author',
        displayName: 'Иван',
        slug: 'ivan',
        avatarUrl: null,
        bio: 'О себе',
        degree: null,
        institution: null,
        links: [{ label: 'Сайт', url: 'https://example.com' }],
        isPublic: false,
      }),
    ).toEqual(draft({ displayName: 'Иван', slug: 'ivan', bio: 'О себе', links: [{ label: 'Сайт', url: 'https://example.com' }] }));
  });
});
