import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, declineAnalytics, publishArticle } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

test('a reader opens an article from the navigation tree', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true }).click();

  await expect(page).toHaveURL(/\/article\/salat$/);
  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Мазхабы:' }).first()).toBeVisible();
});

test('an article page sets its own document title and canonical link', async ({ page }) => {
  await page.goto('/article/salat');

  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Салат — mktba');
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', /\/article\/salat$/);
});

test('choosing a mazhab switches the shown opinions and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true }).click();
  const firstSlot = page.getByRole('tablist', { name: 'Мазхабы:' }).first();
  await expect(firstSlot.getByRole('tab', { name: 'Ханафиты' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Мазхаб не выбран' }).click();
  await page.getByRole('button', { name: /Шафиитский мазхаб/ }).click();

  await expect(firstSlot.getByRole('tab', { name: /^Шафииты.*ваш мазхаб$/ })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => localStorage.getItem('mktba.mazhab'))).not.toBeNull();

  await page.reload();
  await expect(
    page.getByRole('tablist', { name: 'Мазхабы:' }).first().getByRole('tab', { name: 'Шафииты' }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('a reader whose mazhab has no opinion of its own sees the common one with a note (R-01)', async ({ page, request }) => {
  const schools = await (await request.get(`${API_URL}/schools/system`)).json() as { id: number; slug: string }[];
  const schoolId = (slug: string) => schools.find((school) => school.slug === slug)!.id;
  const article = await publishArticle(request, `Мнения без ханафитов ${Date.now()}`, [
    {
      order: 1,
      opinions: [
        { content: 'Общее мнение для всех', isDefault: true, schoolIds: [] },
        { content: 'Отдельное мнение маликитов', isDefault: false, schoolIds: [schoolId('maliki')] },
      ],
    },
  ]);
  await page.addInitScript((id) => localStorage.setItem('mktba.mazhab', String(id)), schoolId('hanafi'));

  await page.goto(`/article/${article.slug}`);

  const slot = page.getByRole('tablist', { name: 'Мазхабы:' });
  await expect(slot.getByRole('tab', { name: 'Общее мнение' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('У ханафитов отдельного мнения нет — показано общее')).toBeVisible();
  await expect(page.getByText('Общее мнение для всех')).toBeVisible();

  await slot.getByRole('tab', { name: 'Маликиты' }).click();
  await expect(page.getByText('Отдельное мнение маликитов')).toBeVisible();
  await expect(page.getByText(/отдельного мнения нет/)).toBeHidden();
});

test('an unknown page and a missing article show the 404 page', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();

  await page.goto('/article/999999999');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('an article page has no serious or critical accessibility violations (O-10)', async ({ page }) => {
  await page.goto('/article/salat');
  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();

  // Colour contrast is R-17 (#141); the rest must stay clean.
  const { violations } = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);

  expect(serious).toEqual([]);
});
