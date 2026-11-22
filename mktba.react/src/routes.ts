import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

/**
 * Every page of the app. The public site (`MainLayout`) is rendered on the server: its route
 * modules have a server `loader` that fetches the API and hands the data to React Query. `/admin/*`
 * is client-only (`clientLoader` + `HydrateFallback`), so auth never runs on the server.
 * `robots.txt`, the sitemap files and the IndexNow key file are resource routes: a loader returning
 * the file, no page.
 * Articles live directly at `/{slug}` (O-02, #53): a static segment outranks the `:slug` param, and
 * every first segment a page uses is a reserved slug (`RESERVED_ARTICLE_SLUGS`). The old
 * `/article/{slug-or-id}` URLs are the same route module, whose loader answers 301 to `/{slug}`.
 */
export default [
  layout('routes/public-layout.tsx', [
    index('routes/home.tsx'),
    route('search', 'routes/search.tsx'),
    route('feedback', 'routes/feedback.tsx'),
    route('article/new', 'routes/legacy-add-article.tsx'),
    route('article/:slug', 'routes/article.tsx', { id: 'routes/legacy-article' }),
    route(':slug', 'routes/article.tsx'),
    route('authors/:slug', 'routes/author.tsx'),
    route('tags/:slug', 'routes/tag.tsx'),
    route('admin/login', 'routes/admin-login.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
  route('admin/*', 'routes/admin.tsx'),
  route('robots.txt', 'routes/robots.ts'),
  route('indexnow-key.txt', 'routes/indexnow-key.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('sitemaps/:file', 'routes/sitemap-chunk.ts'),
] satisfies RouteConfig;
