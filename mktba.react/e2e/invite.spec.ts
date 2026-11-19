import { expect, test, type Page } from '@playwright/test';
import { declineAnalytics, logIn } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

const createInvite = async (page: Page, role: string) => {
  await page.goto('/admin?section=adminAccess');
  await page.getByLabel('Роль', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: 'Создать приглашение' }).click();
  const token = (await page.getByTestId('invite-token').textContent())?.trim();
  expect(token).toBeTruthy();
  return token!;
};

const register = async (page: Page, email: string, token: string) => {
  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'Зарегистрироваться по приглашению' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill('E2e-author-password-1');
  await page.getByLabel('Код приглашения').fill(token);
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
};

test('an author invited by an admin writes and submits an article but cannot publish or manage users', async ({ page, browser }) => {
  const stamp = Date.now();
  const title = `E2E автор ${stamp}`;
  const slug = `e2e-avtor-${stamp}`;
  await logIn(page);
  const token = await createInvite(page, 'Автор');

  const authorContext = await browser.newContext();
  const author = await authorContext.newPage();
  await declineAnalytics(author);
  await register(author, `author-${stamp}@mktba.local`, token);
  await expect(author).toHaveURL(/\/admin$/);
  await expect(author.getByRole('button', { name: 'Пользователи и приглашения' })).toHaveCount(0);

  await author.getByRole('button', { name: 'Добавить статью' }).click();
  await author.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await author.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Абзац приглашённого автора.');
  await author.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(author).toHaveURL(new RegExp(`/article/${slug}$`));

  await author.goto('/admin');
  await author.getByRole('complementary').getByRole('link', { name: title, exact: true }).click();
  const statusPanel = author.getByTestId('article-status-panel');
  await statusPanel.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(statusPanel.getByText('На проверке')).toBeVisible();
  await expect(statusPanel.getByRole('button', { name: 'Опубликовать' })).toHaveCount(0);
  await authorContext.close();

  // The admin sees the invite as used, by the new author.
  await page.goto('/admin?section=adminAccess');
  const row = page.getByTestId('invite-row').filter({ hasText: `author-${stamp}@mktba.local` });
  await expect(row.getByText('Использовано')).toBeVisible();
});

test('an invite works once: a second registration with it is refused', async ({ page, browser }) => {
  const stamp = Date.now();
  await logIn(page);
  const token = await createInvite(page, 'Читатель');

  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await declineAnalytics(firstPage);
  await register(firstPage, `reader-${stamp}@mktba.local`, token);
  await expect(firstPage).toHaveURL(/\/admin$/);
  await first.close();

  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await declineAnalytics(secondPage);
  await register(secondPage, `reader-again-${stamp}@mktba.local`, token);
  await expect(secondPage.getByText('Это приглашение уже использовано.')).toBeVisible();
  await expect(secondPage).toHaveURL(/\/admin\/login$/);
  await second.close();
});
