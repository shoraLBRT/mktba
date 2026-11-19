import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSiteUrl } from './siteUrl.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSiteUrl', () => {
  it('given PUBLIC_SITE_URL, when resolved, then uses it without a trailing slash', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://mktba.ru/');

    expect(resolveSiteUrl(new Request('http://10.0.0.5:3000/article/salat'))).toBe('https://mktba.ru');
  });

  it('given no PUBLIC_SITE_URL, when resolved, then falls back to the request origin', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');

    expect(resolveSiteUrl(new Request('http://localhost:5173/article/salat?mazhab=hanafi'))).toBe('http://localhost:5173');
  });
});
