import { expect, type Page } from '@playwright/test';

export const adminCredentials = () => {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set E2E_ADMIN_PASSWORD (any random string) before running the e2e tests.');
  }
  return { email: process.env.E2E_ADMIN_EMAIL ?? 'e2e@mktba.local', password };
};

// The analytics consent banner is declined up front so it never covers the page.
export const declineAnalytics = async (page: Page) => {
  await page.addInitScript(() => localStorage.setItem('mktba.consent', 'false'));
};

export const logIn = async (page: Page) => {
  const { email, password } = adminCredentials();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Статьи', level: 1 })).toBeVisible();
};
