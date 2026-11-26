import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, adminCredentials, declineAnalytics, logIn, publishArticle } from './helpers';

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

// V-02 (#118): the admin refuses an application with a reason the applicant sees, then approves
// the next one, which makes the applicant a scholar.
test('an admin refuses one application with a reason and approves the next', async ({ page, request }) => {
  const stamp = Date.now();
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  const admin = { Authorization: `Bearer ${(await login.json() as { accessToken: string }).accessToken}` };
  const invite = await request.post(`${API_URL}/invites`, { headers: admin, data: { role: 'Reader' } });
  const { token } = await invite.json() as { token: string };
  const email = `scholar-review-${stamp}@mktba.local`;
  const password = 'E2e-reader-password-1';
  expect((await request.post(`${API_URL}/auth/register`, { data: { email, password, inviteToken: token } })).ok()).toBe(true);
  const applicantLogin = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  const own = { Authorization: `Bearer ${(await applicantLogin.json() as { accessToken: string }).accessToken}` };
  const apply = async () => {
    const response = await request.post(`${API_URL}/scholar-application`, {
      headers: own,
      multipart: {
        degree: 'Доктор исламских наук',
        institution: 'Университет аль-Азхар',
        specialization: 'Фикх',
        documents: { name: 'диплом.pdf', mimeType: 'application/pdf', buffer: PDF },
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json() as { id: number }).id;
  };

  const first = await apply();
  await logIn(page);
  await page.getByRole('navigation', { name: 'Разделы админки' }).first().getByRole('link', { name: 'Заявки учёных' }).click();
  await expect(page).toHaveURL(/\/admin\/scholar-applications$/);
  await expect(page.getByTestId(`scholar-review-row-${first}`)).toContainText(email);
  await page.getByRole('link', { name: `Открыть заявку ${first}` }).click();
  await expect(page.getByTestId('scholar-review-status')).toHaveText('Ждёт проверки');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать диплом.pdf' }).click();
  expect((await download).suggestedFilename()).toBe('диплом.pdf');

  await page.getByRole('button', { name: 'Отклонить' }).click();
  await page.getByLabel('Причина (её увидит автор заявки)').fill('Скан нечитаем, приложите другой.');
  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(
    violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByTestId('scholar-review-status')).toHaveText('Отклонена');

  const refused = await (await request.get(`${API_URL}/scholar-application`, { headers: own })).json() as {
    canApply: boolean;
    application: { status: string; decisionReason: string; documents: unknown[] };
  };
  expect(refused.canApply).toBe(true);
  expect(refused.application).toMatchObject({ status: 'Rejected', decisionReason: 'Скан нечитаем, приложите другой.', documents: [] });

  const second = await apply();
  await page.goto(`/admin/scholar-applications/${second}`);
  await page.getByRole('button', { name: 'Одобрить' }).click();
  await page.getByRole('button', { name: 'Да, одобрить' }).click();
  await expect(page.getByTestId('scholar-review-status')).toHaveText('Одобрена');
  await expect(page.getByRole('button', { name: 'Отозвать статус учёного' })).toBeVisible();
  const me = await (await request.get(`${API_URL}/auth/me`, { headers: own })).json() as { role: string };
  expect(me.role).toBe('Scholar');

  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(375);
});

// V-03 (#119): an approved scholar of a madhab reviews the latest revision of a published article:
// they see what readers of their madhab see, give «есть ошибки» with a comment, and the mark is
// tied to that revision and logged.
test('an approved scholar reviews the latest revision of a published article within their madhab', async ({ page, request }) => {
  const stamp = Date.now();
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  const admin = { Authorization: `Bearer ${(await login.json() as { accessToken: string }).accessToken}` };
  const invite = await request.post(`${API_URL}/invites`, { headers: admin, data: { role: 'Reader' } });
  const { token } = await invite.json() as { token: string };
  const email = `scholar-verdict-${stamp}@mktba.local`;
  const password = 'E2e-reader-password-1';
  expect((await request.post(`${API_URL}/auth/register`, { data: { email, password, inviteToken: token } })).ok()).toBe(true);
  const scholarLogin = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  const own = { Authorization: `Bearer ${(await scholarLogin.json() as { accessToken: string }).accessToken}` };
  const applied = await request.post(`${API_URL}/scholar-application`, {
    headers: own,
    multipart: {
      degree: 'Доктор исламских наук',
      institution: 'Университет аль-Азхар',
      specialization: 'Фикх',
      mazhab: 'hanafi',
      documents: { name: 'диплом.pdf', mimeType: 'application/pdf', buffer: PDF },
    },
  });
  expect(applied.status()).toBe(201);
  const applicationId = (await applied.json() as { id: number }).id;
  expect((await request.post(`${API_URL}/scholar-applications/${applicationId}/approve`, { headers: admin })).ok()).toBe(true);
  const schools = await (await request.get(`${API_URL}/schools/system`)).json() as { id: number; slug: string }[];
  const hanafi = schools.find((school) => school.slug === 'hanafi')!.id;
  const maliki = schools.find((school) => school.slug === 'maliki')!.id;
  const title = `E2E ревью учёного ${stamp}`;
  const article = await publishArticle(request, title, [
    { order: 1, opinions: [{ content: 'Общий для всех абзац.', isDefault: true, schoolIds: [] }] },
    {
      order: 2,
      opinions: [
        { content: 'Мнение ханафитов.', isDefault: false, schoolIds: [hanafi] },
        { content: 'Мнение маликитов.', isDefault: true, schoolIds: [maliki] },
      ],
    },
  ]);

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/sessions$/);
  await page.getByRole('navigation', { name: 'Разделы админки' }).first().getByRole('link', { name: 'Ревью статей' }).click();
  await expect(page).toHaveURL(/\/admin\/article-reviews$/);
  await page.getByLabel('Поиск по названию').fill(title);
  await expect(page.getByTestId(`article-review-row-${article.id}`)).toContainText('Нет');
  await page.getByRole('link', { name: `Ревью статьи «${title}»` }).click();

  await expect(page.getByText('читатели мазхаба «Ханафитский»', { exact: false })).toBeVisible();
  await expect(page.getByText('Мнение ханафитов.')).toBeVisible();
  await expect(page.getByText('Мнение маликитов.')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Есть ошибки' }).check();
  await expect(page.getByRole('button', { name: 'Отправить отметку' })).toBeDisabled();
  await page.getByLabel('Комментарий').fill('Во втором абзаце нужна ссылка на источник.');
  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(
    violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Отправить отметку' }).click();

  await expect(page.getByText('Отметка для ревизии 1 сохранена.')).toBeVisible();
  await expect(page.getByTestId('my-review-1')).toContainText('Есть ошибки · текущая версия');
  await expect(page.getByTestId('my-review-1')).toContainText('Во втором абзаце нужна ссылка на источник.');
  const log = await (await request.get(`${API_URL}/audit-log?action=ArticleReviewed&articleId=${article.id}`, { headers: admin })).json() as {
    items: { toValue: string }[];
  };
  expect(log.items.map((entry) => entry.toValue)).toEqual(['HasErrors']);

  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(375);
});
