import { expect, test } from '@playwright/test';
import { declineAnalytics } from './helpers';

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

test('choosing a mazhab switches the shown opinions and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true }).click();
  const firstSlot = page.getByRole('tablist', { name: 'Мазхабы:' }).first();
  await expect(firstSlot.getByRole('tab', { name: 'Мнение мазхаба: Ханафитский мазхаб' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Мазхаб не выбран' }).click();
  await page.getByRole('button', { name: /Шафиитский мазхаб/ }).click();

  await expect(firstSlot.getByRole('tab', { name: 'Мнение мазхаба: Шафиитский мазхаб' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => localStorage.getItem('mktba.mazhab'))).not.toBeNull();

  await page.reload();
  await expect(
    page.getByRole('tablist', { name: 'Мазхабы:' }).first().getByRole('tab', { name: 'Мнение мазхаба: Шафиитский мазхаб' }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('an unknown page and a missing article show the 404 page', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();

  await page.goto('/article/999999999');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveURL(/\/$/);
});
