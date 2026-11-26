import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, adminCredentials, declineAnalytics } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'ascii');

// V-01 (#117): a reader applies for the scholar status with a document; the document is private —
// the admin reads it, an anonymous visitor does not — and the application waits for an admin.
test('a reader applies for the scholar status with a private document and can withdraw it', async ({ page, request }) => {
  const stamp = Date.now();
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  expect(login.ok()).toBe(true);
  const admin = { Authorization: `Bearer ${(await login.json() as { accessToken: string }).accessToken}` };
  const invite = await request.post(`${API_URL}/invites`, { headers: admin, data: { role: 'Reader' } });
  expect(invite.ok()).toBe(true);
  const { token } = await invite.json() as { token: string };
  const email = `scholar-${stamp}@mktba.local`;
  const password = 'E2e-reader-password-1';
  expect((await request.post(`${API_URL}/auth/register`, { data: { email, password, inviteToken: token } })).ok()).toBe(true);

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sessions$/);
  await page.getByRole('navigation', { name: 'Разделы админки' }).first().getByRole('link', { name: 'Заявка учёного' }).click();
  await expect(page).toHaveURL(/\/admin\/scholar-application$/);
  await expect(page.getByRole('heading', { name: 'Заявка на статус учёного', level: 1 })).toBeVisible();

  await page.getByLabel('Учёная степень или звание').fill('Доктор исламских наук');
  await page.getByLabel('Учебное заведение').fill('Университет аль-Азхар');
  await page.getByLabel('Специализация').fill('Фикх');
  await page.getByLabel('Мазхаб').selectOption('shafii');
  await page.getByTestId('scholar-documents-file').setInputFiles({ name: 'диплом.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByTestId('scholar-picked-documents')).toContainText('диплом.pdf');
  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(
    violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Отправить заявку' }).click();

  await expect(page.getByTestId('scholar-application-status')).toHaveText('Ждёт проверки');
  await expect(page.getByRole('form', { name: 'Новая заявка' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать диплом.pdf' }).click();
  expect((await download).suggestedFilename()).toBe('диплом.pdf');

  // The applicant's own token reads the application; the admin reads the document, nobody else does.
  const applicant = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  const own = { Authorization: `Bearer ${(await applicant.json() as { accessToken: string }).accessToken}` };
  const state = await (await request.get(`${API_URL}/scholar-application`, { headers: own })).json() as {
    application: { documents: { id: number }[] };
  };
  const documentUrl = `${API_URL}/scholar-application/documents/${state.application.documents[0].id}`;
  const asAdmin = await request.get(documentUrl, { headers: admin });
  expect(asAdmin.status()).toBe(200);
  expect(Buffer.from(await asAdmin.body()).equals(PDF)).toBe(true);
  expect((await request.get(documentUrl)).status()).toBe(401);

  await page.getByRole('button', { name: 'Отозвать заявку' }).click();
  await page.getByRole('button', { name: 'Да, отозвать' }).click();
  await expect(page.getByTestId('scholar-application-status')).toHaveText('Отозвана');
  await expect(page.getByRole('form', { name: 'Новая заявка' })).toBeVisible();
  expect((await request.get(documentUrl, { headers: admin })).status()).toBe(404);

  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(375);
});
