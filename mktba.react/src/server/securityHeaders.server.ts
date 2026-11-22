/**
 * Security headers of the site's responses (X-06, #160): pages and `.data` requests (`entry.server.tsx`).
 * The reverse proxy that terminates TLS (`deploy/Caddyfile`) adds HSTS and nosniff to every response,
 * static assets and resource routes (robots.txt, the sitemaps) included.
 *
 * The CSP restricts what cannot break the page: no plugins, no `<base>` from elsewhere, forms only to
 * this site, framing only by this site and by Yandex Metrika (its click and link maps show the page in
 * a frame on metrika.yandex.*). Scripts, styles, images and connections are not restricted yet: the
 * hydration scripts are inline and Metrika loads its own code, so a script policy needs nonces and a
 * check of Metrika in a real browser first — follow-up #267. For the same
 * reason there is no `X-Frame-Options` (it cannot allow Metrika); `frame-ancestors` replaces it.
 */

/** The origins that may frame the site: Yandex Metrika's click map, link map and Webvisor. */
export const METRIKA_FRAME_ANCESTORS = [
  'https://metrika.yandex.ru',
  'https://metrika.yandex.by',
  'https://metrika.yandex.kz',
  'https://metrika.yandex.com',
  'https://metrika.yandex.com.tr',
  'https://webvisor.com',
  'https://*.webvisor.com',
] as const;

export const SITE_CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  `frame-ancestors 'self' ${METRIKA_FRAME_ANCESTORS.join(' ')}`,
].join('; ');

export const SITE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': SITE_CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Adds the security headers to `headers`; a header a route set itself is kept. */
export const applySecurityHeaders = (headers: Headers): Headers => {
  for (const [name, value] of Object.entries(SITE_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
};
