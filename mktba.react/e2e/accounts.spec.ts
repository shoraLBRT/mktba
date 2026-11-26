import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { declineAnalytics } from './helpers';

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

const PASSWORD = 'e2e reader passphrase';

// U-05 (#126). The e2e API sends no email (Email__Smtp__Enabled=false), so the links of the emails
// are covered by the API tests; here: the pages, signing in before confirming, and the notice.
test('a reader signs up, signs in before confirming and is offered the confirmation email again', async ({ page }, testInfo) => {
  const email = `e2e-reader-${Date.now()}-${testInfo.project.name}@mktba.test`;

  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Вход', level: 1 })).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: 'Регистрация читателя', level: 1 })).toBeVisible();
  const trap = page.locator('input[name="website"]');
  await expect(trap).not.toBeInViewport();
  await expect(trap).toHaveAttribute('tabindex', '-1');
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Имя (необязательно)').fill('E2E Читатель');
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту', level: 1 })).toBeFocused();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('link', { name: 'Перейти ко входу' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/admin\/profile$/);
  const notice = page.getByTestId('email-confirmation-notice');
  await expect(notice).toContainText(`Адрес ${email} не подтверждён`);
  await notice.getByRole('button', { name: 'Отправить письмо ещё раз' }).click();
  await expect(notice.getByRole('status')).toHaveText('Письмо отправлено. Проверьте почту.');
  expect(await seriousViolations(page)).toEqual([]);

  // #322: a reader cannot write articles, so the public header does not offer to; the role comes from /auth/me.
  const me = page.waitForResponse((response) => response.url().endsWith('/auth/me') && response.ok());
  await page.goto('/');
  await me;
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить статью' })).toHaveCount(0);
});

test('a password reset answers the same for any address, and a broken link says so', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Забыли пароль?' }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Email').fill('nobody-here@mktba.test');
  await page.getByRole('button', { name: 'Прислать ссылку' }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте почту', level: 1 })).toBeFocused();
  await expect(page.getByText('Если на nobody-here@mktba.test есть аккаунт')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/reset-password#token=not-a-real-token');
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Новый пароль').fill(PASSWORD);
  await page.getByLabel('Повторите пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('alert')).toContainText('Ссылка не работает');
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('/confirm-email#token=not-a-real-token');
  await expect(page.getByRole('heading', { name: 'Не удалось подтвердить адрес', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Ссылка не работает');
  await expect(page).toHaveURL(/\/confirm-email$/);
  expect(await seriousViolations(page)).toEqual([]);
});
