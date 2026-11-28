import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_URL, declineAnalytics, logIn, publishArticle } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

/** Serious and critical axe violations on the page. Colour contrast is R-17 (#141). */
const seriousViolations = async (page: Page): Promise<string[]> => {
  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
};

// C-01 (#127), moderation C-02 (#128): comments under a published article. They come in the browser only (not in the server
// HTML), render the Markdown minimum without raw HTML, and their links are not followed (C-06, #132).
test('a reader comments under an article, answers, edits and deletes; the server HTML holds no comment', async ({ page, request, browser }, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const article = await publishArticle(request, `Комментарии E2E ${stamp}`, [
    { order: 1, opinions: [{ content: 'Текст статьи для комментариев.', isDefault: true, schoolIds: [] }] },
  ]);

  // An invited reader is confirmed when they register; the comment is signed with the profile name.
  const invite = await request.post(`${API_URL}/invites`, { headers: article.headers, data: { role: 'Reader' } });
  expect(invite.ok()).toBe(true);
  const { token } = await invite.json() as { token: string };
  const email = `commenter-${stamp}@mktba.local`;
  const password = 'E2e-reader-password-1';
  expect((await request.post(`${API_URL}/auth/register`, { data: { email, password, inviteToken: token } })).ok()).toBe(true);
  const login = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  const reader = { Authorization: `Bearer ${(await login.json() as { accessToken: string }).accessToken}` };
  const name = `Читатель ${stamp}`;
  expect((await request.put(`${API_URL}/profile`, { headers: reader, data: { displayName: name, links: [] } })).ok()).toBe(true);
  const first = await request.post(`${API_URL}/articles/${article.id}/comments`, {
    headers: reader,
    data: { body: '**Спасибо** за [источник](https://example.com/e2e)! <script>window.__commentXss = 1</script>', website: '' },
  });
  expect(first.ok()).toBe(true);

  // C-02 (#128): a new reader's first comment waits for a moderator; the admin approves it in /admin/comments.
  const held = await first.json() as { id: number; isPending: boolean };
  expect(held.isPending).toBe(true);
  expect((await (await request.get(`${API_URL}/articles/${article.id}/comments`)).json() as { total: number }).total).toBe(0);
  // A page of its own context: axe cannot analyse a page made by browser.newPage().
  const moderatorContext = await browser.newContext();
  const moderator = await moderatorContext.newPage();
  await declineAnalytics(moderator);
  await logIn(moderator);
  await moderator.goto('/admin/comments');
  const queued = moderator.locator(`[data-testid="moderation-item"][data-comment-id="${held.id}"]`);
  await expect(queued).toContainText('Новый читатель');
  expect(await seriousViolations(moderator)).toEqual([]);
  await queued.getByRole('button', { name: 'Одобрить' }).click();
  await expect(queued).toHaveCount(0);
  await moderatorContext.close();

  const html = await (await request.get(`/${article.slug}`)).text();
  expect(html).not.toContain('Спасибо');
  expect(html).not.toContain('example.com/e2e');

  // An anonymous visitor reads the comment and is asked to sign in to write one.
  await page.goto(`/${article.slug}`);
  const comments = page.getByRole('region', { name: 'Комментарии' });
  await comments.scrollIntoViewIfNeeded();
  const firstComment = comments.getByTestId('comment').first();
  await expect(firstComment).toContainText(name);
  await expect(firstComment.locator('strong')).toHaveText('Спасибо');
  await expect(firstComment.getByRole('link', { name: 'источник' })).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer');
  expect(await page.evaluate(() => (globalThis as { __commentXss?: number }).__commentXss)).toBeUndefined();
  await expect(comments.getByTestId('comments-sign-in')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // Signed in, the reader answers, edits the answer and deletes it.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await page.goto(`/${article.slug}`);
  await comments.scrollIntoViewIfNeeded();
  const answered = comments.getByTestId('comment').first();
  await answered.getByRole('button', { name: 'Ответить' }).click();
  await answered.getByLabel('Ваш ответ').fill('Ответ *читателя*.');
  await answered.getByRole('button', { name: 'Отправить' }).click();
  const reply = comments.getByTestId('comment').nth(1);
  await expect(reply).toContainText('Ответ читателя.');
  await expect(reply.locator('em')).toHaveText('читателя');
  expect(await seriousViolations(page)).toEqual([]);

  await reply.getByRole('button', { name: 'Изменить' }).click();
  await reply.getByLabel('Текст комментария').fill('Ответ исправлен.');
  await reply.getByRole('button', { name: 'Сохранить' }).click();
  await expect(reply).toContainText('Ответ исправлен.');
  await expect(reply).toContainText('изменён');

  await reply.getByRole('button', { name: 'Удалить' }).click();
  await reply.getByRole('button', { name: 'Да, удалить' }).click();
  await expect(comments.getByTestId('comment')).toHaveCount(1);

  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
});
