import { afterEach, describe, expect, it } from 'vitest';
import { clearStoredAdminToken, getStoredAdminToken, setStoredAdminToken } from './authTokenStorage';

describe('authTokenStorage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('given a stored token, when it is read, then the same token is returned', () => {
    setStoredAdminToken('token-1');

    expect(getStoredAdminToken()).toBe('token-1');
    expect(localStorage.getItem('mktba.admin.token')).toBe('token-1');
  });

  it('given only a token under the legacy key, when it is read, then it is returned and moved to the new key', () => {
    localStorage.setItem('wikiweaver.admin.token', 'legacy-token');

    expect(getStoredAdminToken()).toBe('legacy-token');
    expect(localStorage.getItem('mktba.admin.token')).toBe('legacy-token');
    expect(localStorage.getItem('wikiweaver.admin.token')).toBeNull();
  });

  it('given no token under either key, when it is read, then null is returned', () => {
    expect(getStoredAdminToken()).toBeNull();
  });

  it('given tokens under both keys, when the token is cleared, then neither key remains', () => {
    localStorage.setItem('wikiweaver.admin.token', 'legacy-token');
    setStoredAdminToken('token-1');
    localStorage.setItem('wikiweaver.admin.token', 'legacy-token');

    clearStoredAdminToken();

    expect(getStoredAdminToken()).toBeNull();
  });
});
