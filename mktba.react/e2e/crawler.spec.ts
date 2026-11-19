import { expect, test } from '@playwright/test';
import { adminCredentials } from './helpers';

// robots.txt and sitemap.xml are served by the SSR app (O-06, #57).

const API_URL = 'http://localhost:5172';

test('robots.txt bars the admin panel, folds tracking params and names the absolute sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
  const robots = await response.text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toMatch(/^Clean-param: mazhab&utm_source&.+ \/$/m);
  expect(robots).toMatch(/^Sitemap: https?:\/\/[^/]+\/sitemap\.xml$/m);
});

test('sitemap.xml lists a published article and leaves a draft out', async ({ request }) => {
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json() as { accessToken: string };
  const draft = await request.post(`${API_URL}/articles/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: `Черновик для карты сайта ${Date.now()}`,
      paragraphs: [{ order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] }],
    },
  });
  expect(draft.status()).toBe(201);
  const { slug: draftSlug } = await draft.json() as { slug: string };

  const response = await request.get('/sitemap.xml');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/xml');
  const xml = await response.text();
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect(xml).toMatch(/<loc>https?:\/\/[^/]+\/article\/salat<\/loc><lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod>/);
  expect(xml).not.toContain(`/article/${draftSlug}<`);
});
