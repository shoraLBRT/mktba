import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, declineAnalytics, publishArticle } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

// P-01 (#89): the public author page — the profile, the articles a reader can open, the server HTML.
test('an author with a published article has a public page with the profile and the article, also in the server HTML', async ({ page, request }) => {
  const stamp = Date.now();
  const name = `E2E Автор страницы ${stamp}`;
  const slug = `e2e-author-page-${stamp}`;
  const title = `E2E статья автора ${stamp}`;
  // The e2e admin writes the article, so it is credited to them.
  const article = await publishArticle(
    request, title, [{ order: 1, opinions: [{ content: 'Текст статьи автора.', isDefault: true, schoolIds: [] }] }], { summary: 'Кратко о статье автора' },
  );
  const saved = await request.put(`${API_URL}/profile`, {
    headers: article.headers,
    data: {
      displayName: name,
      slug,
      // Nothing answers at this address: the page must fall back to the initial.
      avatarUrl: '/no-such-avatar.png',
      bio: 'Пишу для E2E-проверки.\nВторая строка.',
      links: [{ label: 'Сайт автора', url: 'https://example.com/e2e-author' }],
    },
  });
  expect(saved.ok()).toBe(true);

  const response = await request.get(`/authors/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(name);
  expect(html).toContain(title);
  expect(html).toContain('Пишу для E2E-проверки.');
  expect(html).toContain('"@type":"Person"');
  expect(html).toContain(`<link rel="canonical" href="http://localhost:5173/authors/${slug}"`);
  expect(html).not.toContain('noindex');
  expect(html).not.toContain('e2e@mktba.local');

  await page.goto(`/authors/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page).toHaveTitle(`${name} — mktba`);
  await expect(page.getByTestId('author-role')).toHaveText('Администратор');
  await expect(page.getByRole('link', { name: 'Сайт автора' })).toHaveAttribute('rel', 'nofollow noopener');
  // The broken avatar gives way to the first letter of the name, in a box of the same size.
  await expect(page.getByTestId('author-avatar').getByRole('img')).toHaveCount(0);
  await expect(page.getByTestId('author-avatar')).toHaveText('E');
  expect(await page.getByTestId('author-avatar').boundingBox()).toMatchObject({ width: 96, height: 96 });

  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(
    violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`),
  ).toEqual([]);

  // At 320 px nothing sticks out of the page.
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(320);

  const articles = page.getByRole('region', { name: 'Статьи' });
  await expect(articles).toContainText('Кратко о статье автора');
  await expect(articles).toContainText('Опубликовано');
  await articles.getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`/article/${article.slug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);

  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
});

test('a named user without a published article and an unknown address answer 404', async ({ page, request }) => {
  const stamp = Date.now();
  // Any published article gives the admin's token; the invited author below has none of their own.
  const article = await publishArticle(request, `E2E статья админа ${stamp}`, null);
  const invite = await request.post(`${API_URL}/invites`, { headers: article.headers, data: { role: 'Author' } });
  expect(invite.ok()).toBe(true);
  const { token } = await invite.json() as { token: string };
  const registered = await request.post(`${API_URL}/auth/register`, {
    data: { email: `no-articles-${stamp}@mktba.local`, password: 'E2e-author-password-1', inviteToken: token },
  });
  expect(registered.ok()).toBe(true);
  const { accessToken } = await registered.json() as { accessToken: string };
  const slug = `e2e-no-articles-${stamp}`;
  const saved = await request.put(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { displayName: `E2E Без статей ${stamp}`, slug },
  });
  expect(saved.ok()).toBe(true);

  for (const address of [`/authors/${slug}`, '/authors/no-such-author']) {
    const response = await request.get(address);
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).toContain('Страница не найдена');
    expect(html).toContain('noindex');
    expect(html).not.toContain(`E2E Без статей ${stamp}`);
  }

  await page.goto(`/authors/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена');

  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
});
