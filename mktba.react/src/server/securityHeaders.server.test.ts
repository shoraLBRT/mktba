import { describe, expect, it } from 'vitest';
import { handleDataRequest } from '../entry.server';
import { applySecurityHeaders, SITE_CONTENT_SECURITY_POLICY } from './securityHeaders.server';

describe('applySecurityHeaders (X-06)', () => {
  it('adds the CSP, nosniff, the referrer and permissions policies', () => {
    const headers = applySecurityHeaders(new Headers({ 'Content-Type': 'text/html' }));

    expect(headers.get('Content-Security-Policy')).toBe(SITE_CONTENT_SECURITY_POLICY);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('Content-Type')).toBe('text/html');
  });

  it('blocks plugins, foreign <base> and forms, and framing except by this site and Metrika', () => {
    const directives = SITE_CONTENT_SECURITY_POLICY.split('; ');

    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(directives).toContain("form-action 'self'");
    expect(directives.find((d) => d.startsWith('frame-ancestors'))).toMatch(
      /^frame-ancestors 'self' https:\/\/metrika\.yandex\.ru /,
    );
  });

  it('does not restrict scripts, so hydration and Metrika keep working', () => {
    expect(SITE_CONTENT_SECURITY_POLICY).not.toMatch(/default-src|script-src|connect-src|img-src|style-src/);
  });

  it('keeps a header the route set itself', () => {
    const headers = applySecurityHeaders(new Headers({ 'Referrer-Policy': 'no-referrer' }));

    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('is applied to data requests', () => {
    const response = handleDataRequest(new Response('[]', { headers: { 'Content-Type': 'text/x-script' } }));

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe(SITE_CONTENT_SECURITY_POLICY);
  });
});
