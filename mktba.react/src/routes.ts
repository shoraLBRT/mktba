import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

/**
 * Every page of the app. The public site (`MainLayout`) is rendered on the server: its route
 * modules have a server `loader` that fetches the API and hands the data to React Query. `/admin/*`
 * is client-only (`clientLoader` + `HydrateFallback`), so auth never runs on the server.
 * `robots.txt` and the sitemap files are resource routes: a loader returning the file, no page.
 */
export default [
  layout('routes/public-layout.tsx', [
    index('routes/home.tsx'),
    route('article/new', 'routes/legacy-add-article.tsx'),
    route('article/:slug', 'routes/article.tsx'),
    route('admin/login', 'routes/admin-login.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
  route('admin/*', 'routes/admin.tsx'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('sitemaps/:file', 'routes/sitemap-chunk.ts'),
] satisfies RouteConfig;
