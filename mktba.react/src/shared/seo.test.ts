import { describe, expect, it } from 'vitest';
import { buildSeoDto, isValidSocialImageUrl, seoDraftFromDto } from './seo';

describe('isValidSocialImageUrl', () => {
  it.each([
    ['', true],
    ['https://example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['/uploads/a.png', true],
    ['//evil.example.com/a.png', false],
    ['javascript:alert(1)', false],
    ['ftp://example.com/a.png', false],
    ['uploads/a.png', false],
    ['https://example.com/a b.png', false],
  ])('given %j, when checked, then returns %s', (url, expected) => {
    expect(isValidSocialImageUrl(url)).toBe(expected);
  });
});

describe('buildSeoDto', () => {
  it('given blank and padded inputs, when built, then trims and sends blanks as null', () => {
    expect(buildSeoDto({ title: '  Заголовок ', description: '   ', socialImageUrl: '', noIndex: true }))
      .toEqual({ title: 'Заголовок', description: null, socialImageUrl: null, noIndex: true });
  });

  it('given no SEO on the article, when imported, then gives an empty draft', () => {
    expect(seoDraftFromDto(undefined)).toEqual({ title: '', description: '', socialImageUrl: '', noIndex: false });
  });
});
