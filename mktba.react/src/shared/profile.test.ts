import { describe, expect, it } from 'vitest';
import {
  buildProfileDto,
  isValidProfileLinkUrl,
  profileDraftFromDto,
  profileSlugFromName,
  validateProfileDraft,
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

describe('validateProfileDraft', () => {
  it('given a full valid draft, then there is no problem', () => {
    expect(
      validateProfileDraft(
        draft({ slug: 'Ivan-Ivanov', avatarUrl: '/media/ivan.png', links: [{ label: 'Сайт', url: 'https://example.com' }] }),
      ),
    ).toBeNull();
  });

  it('given a slug without a name, then the name is needed', () => {
    expect(validateProfileDraft(draft({ displayName: ' ', slug: 'ivan' }))).toBe('slugNeedsName');
  });

  it.each(['иван', 'ivan--ivanov', '12345', 'ivan ivanov'])('given the slug %j, then it is invalid', (slug) => {
    expect(validateProfileDraft(draft({ slug }))).toBe('slugInvalid');
  });

  it('given an avatar that is neither http(s) nor a site path, then it is invalid', () => {
    expect(validateProfileDraft(draft({ avatarUrl: 'javascript:alert(1)' }))).toBe('avatarUrlInvalid');
  });

  it('given a link without a label or with a bad address, then says which', () => {
    expect(validateProfileDraft(draft({ links: [{ label: '', url: 'https://example.com' }] }))).toBe('linkLabelRequired');
    expect(validateProfileDraft(draft({ links: [{ label: 'Сайт', url: 'example.com' }] }))).toBe('linkUrlInvalid');
  });

  it('given a completely empty link row, then it is ignored', () => {
    expect(validateProfileDraft(draft({ links: [{ label: ' ', url: '' }] }))).toBeNull();
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
