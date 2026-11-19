import { expect, test } from '@playwright/test';
import { declineAnalytics, logIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

test('an admin logs in and reaches the admin panel', async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole('button', { name: 'Добавить статью' })).toBeVisible();
});

test('an admin creates an article and then edits it', async ({ page }) => {
  const title = `E2E статья ${Date.now()}`;
  const editedTitle = `${title} (правка)`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await expect(page).toHaveURL(/\/article\/new$/);
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Первый абзац из E2E-теста.');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page).toHaveURL(/\/article\/\d+$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Первый абзац из E2E-теста.')).toBeVisible();
  const articleUrl = page.url();

  // Inside the admin panel the navigation tree links straight to the editor.
  await page.goto('/admin');
  await page.getByRole('complementary').getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/edit$/);
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(editedTitle);
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page).toHaveURL(articleUrl);
  await expect(page.getByRole('heading', { name: editedTitle, level: 1 })).toBeVisible();
});
