// Node's `process`; the app's TypeScript config has browser types only.
declare const process: { env: Record<string, string | undefined> };

/** A `<meta name content>` a search engine's webmaster tools read to confirm the site is ours. */
export type SiteVerificationMeta = { name: string; content: string };

/** Which environment variable holds the token of which verification meta tag (O-12, #61). */
const SOURCES = [
  { name: 'yandex-verification', env: 'YANDEX_VERIFICATION' },
  { name: 'google-site-verification', env: 'GOOGLE_SITE_VERIFICATION' },
] as const;

/** A token as the services issue them: letters, digits, `-` and `_`; anything else is ignored. */
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The verification meta tags for Yandex Webmaster and Google Search Console, from the tokens set at
 * runtime (`YANDEX_VERIFICATION`, `GOOGLE_SITE_VERIFICATION`); none when neither is set.
 */
export const resolveSiteVerification = (): SiteVerificationMeta[] =>
  SOURCES.flatMap(({ name, env }) => {
    const content = process.env[env]?.trim() ?? '';
    return TOKEN.test(content) ? [{ name, content }] : [];
  });
