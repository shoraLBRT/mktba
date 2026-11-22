import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const adminCredentials = () => {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set E2E_ADMIN_PASSWORD (any random string of 12 or more characters, the new-password minimum) before running the e2e tests.');
  }
  return { email: process.env.E2E_ADMIN_EMAIL ?? 'e2e@mktba.local', password };
};

// The analytics consent banner is declined up front so it never covers the page.
export const declineAnalytics = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem('mktba.consent', 'false'));
};

export const logIn = async (page: Page) => {
  const { email, password } = adminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible();
};

// The admin article tree on /admin/articles/tree, whose titles open the editor.
export const openAdminArticleTree = async (page: Page) => {
  await page.goto('/admin/articles/tree');
  return page.getByRole('region', { name: 'Дерево статей' });
};

export const API_URL = 'http://localhost:5172';

/**
 * Creates an article through the API as the e2e admin and publishes it; returns its id and slug.
 * Without paragraphs it is a stub with no content, created the way the admin tree creates one.
 */
export const publishArticle = async (request: APIRequestContext, title: string, paragraphs: unknown[] | null, extra: Record<string, unknown> = {}) => {
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = paragraphs
    ? await request.post(`${API_URL}/articles/content`, { headers, data: { title, paragraphs, ...extra } })
    : await request.post(`${API_URL}/articles`, { headers, data: { title, ...extra } });
  expect(created.status()).toBe(201);
  const article = await created.json() as { id: number; slug: string };
  for (const status of ['InReview', 'Published']) {
    expect((await request.post(`${API_URL}/articles/${article.id}/status`, { headers, data: { status } })).ok()).toBe(true);
  }
  return { ...article, headers };
};

/**
 * Creates and publishes many articles with one login (bulk status changes, 100 at a time): what a
 * scenario needs to grow the navigation tree past its windowing threshold. Returns them in order,
 * with the headers to delete them afterwards.
 */
export const publishArticles = async (request: APIRequestContext, titles: string[], paragraphs: unknown[], extra: Record<string, unknown> = {}) => {
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const articles: { id: number; slug: string }[] = [];
  for (const title of titles) {
    const created = await request.post(`${API_URL}/articles/content`, { headers, data: { title, paragraphs, ...extra } });
    expect(created.status()).toBe(201);
    articles.push(await created.json() as { id: number; slug: string });
  }

  for (const status of ['InReview', 'Published']) {
    for (let from = 0; from < articles.length; from += 100) {
      const ids = articles.slice(from, from + 100).map((article) => article.id);
      const moved = await request.post(`${API_URL}/articles/bulk/status`, { headers, data: { ids, status } });
      expect(moved.ok()).toBe(true);
      const { results } = await moved.json() as { results: { ok: boolean }[] };
      expect(results.every((result) => result.ok)).toBe(true);
    }
  }
  return { articles, headers };
};
