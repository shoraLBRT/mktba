import { expect, test } from '@playwright/test';
import { API_URL, adminCredentials, declineAnalytics, logIn, publishArticle } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

// U-07 (#72): the profile form is the only way a user gets a public name; the public read is what
// the author page (#89) and the article's author line (#94) will be built on.
test('a user fills in their profile and readers get it by its address, without the email', async ({ page, request }) => {
  const stamp = Date.now();
  const name = `E2E Автор ${stamp}`;
  const slug = `e2e-avtor-${stamp}`;
  // The e2e admin wrote this article, so their profile is one readers may open.
  const article = await publishArticle(request, `E2E статья для профиля ${stamp}`, null);
  await logIn(page);

  await page.getByRole('navigation', { name: 'Разделы админки' }).first().getByRole('link', { name: 'Мой профиль' }).click();
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.getByRole('heading', { name: 'Мой профиль', level: 1 })).toBeVisible();
  // The form opens for typing once the saved profile is in (it may hold a name from author.spec).
  await expect(page.getByLabel('Имя')).toBeEnabled();
  await page.getByLabel('Имя').fill(name);
  await page.getByLabel('Адрес профиля').fill(slug);
  await page.getByLabel('О себе').fill('Пишу для E2E-проверки.');
  // Rows a previous run left are removed, so the scenario can run again on the same database.
  while (await page.getByRole('button', { name: 'Удалить ссылку 1' }).count()) {
    await page.getByRole('button', { name: 'Удалить ссылку 1' }).click();
  }
  await page.getByRole('button', { name: 'Добавить ссылку' }).click();
  await page.getByLabel('Подпись ссылки 1').fill('Сайт');
  await page.getByLabel('Адрес ссылки 1').fill('https://example.com/e2e');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByText('Профиль сохранён')).toBeVisible();
  await expect(page.getByTestId('profile-visibility')).toContainText('Профиль открыт читателям.');
  await expect(page.getByRole('link', { name: 'Открыть страницу автора' })).toHaveAttribute('href', `/authors/${slug}`);

  await page.reload();

  await expect(page.getByLabel('Имя')).toHaveValue(name);
  await expect(page.getByLabel('Адрес профиля')).toHaveValue(slug);
  await expect(page.getByLabel('Адрес ссылки 1')).toHaveValue('https://example.com/e2e');

  const publicProfile = await request.get(`${API_URL}/authors/${slug}`);
  expect(publicProfile.status()).toBe(200);
  const body = await publicProfile.text();
  expect(JSON.parse(body)).toMatchObject({
    slug,
    displayName: name,
    bio: 'Пишу для E2E-проверки.',
    links: [{ label: 'Сайт', url: 'https://example.com/e2e' }],
  });
  expect(body).not.toContain(adminCredentials().email);

  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
});
