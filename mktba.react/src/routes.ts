import { index, layout, prefix, route, type RouteConfig, type RouteConfigEntry } from '@react-router/dev/routes';
import { PREFIXED_LANGUAGES } from './localization/language';

/**
 * The reader's pages in one language. `idPrefix` keeps the route ids of a prefixed language apart
 * from the Russian ones (the same module serves both); `russianOnly` are the static routes only
 * Russian has. `:slug` stays after the static routes.
 */
const readerRoutes = (idPrefix = '', russianOnly: RouteConfigEntry[] = []): RouteConfigEntry[] => {
  const id = (file: string) => (idPrefix ? { id: `${idPrefix}/${file}` } : {});
  return [
    index('routes/home.tsx', id('routes/home')),
    route('search', 'routes/search.tsx', id('routes/search')),
    route('feedback', 'routes/feedback.tsx', id('routes/feedback')),
    ...russianOnly,
    route(':slug', 'routes/article.tsx', id('routes/article')),
    route('authors/:slug', 'routes/author.tsx', id('routes/author')),
    route('tags/:slug', 'routes/tag.tsx', id('routes/tag')),
  ];
};

/**
 * Every page of the app. The public site (`MainLayout`) is rendered on the server: its route
 * modules have a server `loader` that fetches the API and hands the data to React Query. `/admin/*`
 * is client-only (`clientLoader` + `HydrateFallback`), so auth never runs on the server.
 * `robots.txt`, the sitemap files and the IndexNow key file are resource routes: a loader returning
 * the file, no page.
 * Articles live directly at `/{slug}` (O-02, #53): a static segment outranks the `:slug` param, and
 * every first segment a page uses is a reserved slug (`RESERVED_ARTICLE_SLUGS`). The old
 * `/article/{slug-or-id}` URLs are the same route module, whose loader answers 301 to `/{slug}`.
 * The language is in the URL (I-01, #105): the reader's pages are at `/…` in Russian and again under
 * `/en/…` in English (`localization/language.ts`); the old URLs, the sign-in and the admin are
 * Russian only.
 */
export default [
  layout('routes/public-layout.tsx', [
    // Pathless: it only brings the Russian strings with the Russian pages (I-02, #106).
    layout('routes/russian.tsx', readerRoutes('', [
      route('article/new', 'routes/legacy-add-article.tsx'),
      route('article/:slug', 'routes/article.tsx', { id: 'routes/legacy-article' }),
      route('admin/login', 'routes/admin-login.tsx'),
    ])),
    ...PREFIXED_LANGUAGES.flatMap((language) => prefix(language, readerRoutes(language))),
    route('*', 'routes/not-found.tsx'),
  ]),
  route('admin/*', 'routes/admin.tsx'),
  route('robots.txt', 'routes/robots.ts'),
  route('indexnow-key.txt', 'routes/indexnow-key.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('sitemaps/:file', 'routes/sitemap-chunk.ts'),
] satisfies RouteConfig;
