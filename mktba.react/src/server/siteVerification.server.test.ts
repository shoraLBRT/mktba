import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSiteVerification } from './siteVerification.server';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSiteVerification', () => {
  it('given both tokens, when resolved, then gives the Yandex and Google meta tags', () => {
    vi.stubEnv('YANDEX_VERIFICATION', ' 0123abcd4567ef89 ');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', 'Abc-DEF_123');

    expect(resolveSiteVerification()).toEqual([
      { name: 'yandex-verification', content: '0123abcd4567ef89' },
      { name: 'google-site-verification', content: 'Abc-DEF_123' },
    ]);
  });

  it('given no tokens, when resolved, then gives no tags', () => {
    vi.stubEnv('YANDEX_VERIFICATION', '');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', '');

    expect(resolveSiteVerification()).toEqual([]);
  });

  it('given a token with characters no service issues, when resolved, then drops it', () => {
    vi.stubEnv('YANDEX_VERIFICATION', '"><script>');
    vi.stubEnv('GOOGLE_SITE_VERIFICATION', 'good-token');

    expect(resolveSiteVerification()).toEqual([{ name: 'google-site-verification', content: 'good-token' }]);
  });
});
