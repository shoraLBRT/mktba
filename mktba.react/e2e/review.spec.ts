import { expect, test } from '@playwright/test';
import { API_URL, adminCredentials, declineAnalytics, logIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

// A-04 (#87): an article in review is in the queue, shows what is new, goes back with a comment the
// editor then shows, and is published by approval.
test('a reviewer returns an article from the queue with a comment, then approves it', async ({ page, request }) => {
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  const { accessToken } = await login.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const title = `Модерация ${Date.now()}`;
  const created = await request.post(`${API_URL}/articles/content`, {
    headers,
    data: { title, paragraphs: [{ order: 1, opinions: [{ content: 'Текст на проверке.', isDefault: true, schoolIds: [] }] }] },
  });
  expect(created.status()).toBe(201);
  const { id, slug } = await created.json() as { id: number; slug: string };
  expect((await request.post(`${API_URL}/articles/${id}/status`, { headers, data: { status: 'InReview' } })).ok()).toBe(true);

  try {
    await logIn(page);
    await page.getByRole('link', { name: 'Модерация' }).click();
    const row = page.getByTestId(`review-item-${id}`);
    await expect(row).toContainText('Новая статья');
    await row.getByRole('link', { name: 'Проверить' }).click();

    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText(/Статья ещё не публиковалась/)).toBeVisible();
    await expect(page.locator('[data-diff="added"]', { hasText: 'Текст на проверке.' })).toBeVisible();

    const returnButton = page.getByRole('button', { name: 'Вернуть автору' });
    await expect(returnButton).toBeDisabled();
    await page.getByLabel('Комментарий автору').fill('Добавьте источники.');
    await returnButton.click();
    await expect(page.getByText(`Статья «${title}» возвращена автору.`)).toBeVisible();

    await page.goto(`/admin/articles/${id}/edit`);
    const note = page.getByTestId('returned-for-revision');
    await expect(note).toContainText('Добавьте источники.');
    await page.getByTestId('article-status-panel').getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(note).toHaveCount(0);

    await page.goto(`/admin/review/${id}`);
    await page.getByRole('button', { name: 'Одобрить и опубликовать' }).click();
    await expect(page.getByText(`Статья «${title}» опубликована.`)).toBeVisible();

    expect((await request.get(`${API_URL}/articles/by-slug/${slug}/content`)).status()).toBe(200);
  } finally {
    await request.delete(`${API_URL}/articles/${id}`, { headers });
  }
});
