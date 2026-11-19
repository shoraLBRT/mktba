import { describe, expect, it } from 'vitest';
import { resolveAutoOpinionIndex } from './opinionSelection';

const HANAFI = 1;
const MALIKI = 2;
const SHAFII = 3;

const opinions = [
  { isDefault: false, schoolIds: [MALIKI] },
  { isDefault: true, schoolIds: [] },
  { isDefault: false, schoolIds: [SHAFII, HANAFI] },
];

describe('resolveAutoOpinionIndex', () => {
  it('given a mazhab with its own opinion, when resolving, then returns that opinion', () => {
    expect(resolveAutoOpinionIndex(opinions, HANAFI)).toBe(2);
  });

  it('given no mazhab selected, when resolving, then returns the default opinion', () => {
    expect(resolveAutoOpinionIndex(opinions, null)).toBe(1);
  });

  it('given a mazhab without its own opinion, when resolving, then falls back to the default opinion', () => {
    expect(resolveAutoOpinionIndex(opinions, 4)).toBe(1);
  });

  it('given several opinions tagged with the mazhab, when resolving, then returns the first of them', () => {
    const shared = [
      { isDefault: true, schoolIds: [] },
      { isDefault: false, schoolIds: [MALIKI] },
      { isDefault: false, schoolIds: [MALIKI, SHAFII] },
    ];

    expect(resolveAutoOpinionIndex(shared, MALIKI)).toBe(1);
  });

  it('given no default opinion and no mazhab match, when resolving, then returns the first opinion', () => {
    const withoutDefault = [
      { isDefault: false, schoolIds: [MALIKI] },
      { isDefault: false, schoolIds: [SHAFII] },
    ];

    expect(resolveAutoOpinionIndex(withoutDefault, HANAFI)).toBe(0);
  });

  it('given a paragraph without opinions, when resolving, then returns 0', () => {
    expect(resolveAutoOpinionIndex([], HANAFI)).toBe(0);
  });
});
