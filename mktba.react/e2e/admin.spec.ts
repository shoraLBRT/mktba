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
  const stamp = Date.now();
  const title = `E2E статья ${stamp}`;
  const editedTitle = `${title} (правка)`;
  const slug = `e2e-statya-${stamp}`;
  const editedSlug = `e2e-adres-${stamp}`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/new$/);
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await expect(page.getByRole('textbox', { name: 'Адрес статьи' })).toHaveValue(slug);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Первый абзац из E2E-теста.');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page).toHaveURL(new RegExp(`/article/${slug}$`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Первый абзац из E2E-теста.')).toBeVisible();
  const articleUrl = page.url();

  // Inside the admin panel the navigation tree links straight to the editor.
  await page.goto('/admin');
  await page.getByRole('complementary').getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/edit$/);
  const articleId = page.url().match(/\/admin\/articles\/(\d+)\/edit$/)![1];
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(editedTitle);
  await page.getByRole('button', { name: 'Сохранить' }).click();

  // A new title keeps the slug, so links to the article do not change.
  await expect(page).toHaveURL(articleUrl);
  await expect(page.getByRole('heading', { name: editedTitle, level: 1 })).toBeVisible();

  await page.goto(`/admin/articles/${articleId}/edit`);
  await page.getByRole('textbox', { name: 'Адрес статьи' }).fill(editedSlug);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page).toHaveURL(new RegExp(`/article/${editedSlug}$`));

  // The old slug and the pre-slug numeric link both land on the current slug.
  await page.goto(articleUrl);
  await expect(page).toHaveURL(new RegExp(`/article/${editedSlug}$`));
  await expect(page.getByRole('heading', { name: editedTitle, level: 1 })).toBeVisible();
  await page.goto(`/article/${articleId}`);
  await expect(page).toHaveURL(new RegExp(`/article/${editedSlug}$`));
});

test('without a configured AI provider the editor explains where to set it up', async ({ page }) => {
  await logIn(page);
  await page.getByRole('button', { name: 'Добавить статью' }).click();

  await expect(page.getByRole('button', { name: 'Улучшить с ИИ' })).toBeDisabled();
  await expect(page.getByText(/ИИ не настроен/)).toBeVisible();
  await page.getByRole('link', { name: 'Открыть настройки ИИ' }).click();

  await expect(page).toHaveURL(/\/admin\?section=aiProvider$/);
  const baseUrl = page.locator('input[name="ai-base-url"]');
  await expect(baseUrl).toHaveValue('');
  await expect(baseUrl).toHaveAttribute('placeholder', 'https://api.openai.com/v1');
});
