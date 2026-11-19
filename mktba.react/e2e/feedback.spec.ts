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

// The e2e API runs with Feedback:GitHub:Enabled=false: a message is stored and nothing is filed.
test('a reader reports an error from the article and gets the message number (F-01)', async ({ page }) => {
  await page.goto('/article/salat?mazhab=shafii');
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await page.getByTestId('article-report-error').getByRole('link', { name: 'Сообщить об ошибке' }).click();

  await expect(page).toHaveURL(/\/feedback\?/);
  await expect(page.getByRole('heading', { name: 'Обратная связь', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Обратная связь — mktba');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('radio', { name: 'Ошибка в статье' })).toBeChecked();

  // What goes with the message is said before sending: the page, the article and the mazhab of the link.
  const attached = page.getByRole('region', { name: 'Что будет отправлено вместе с сообщением' });
  await expect(attached.getByRole('link')).toHaveAttribute('href', '/article/salat?mazhab=shafii');
  await expect(attached).toContainText('Статья: Салат');
  await expect(attached.getByTestId('feedback-mazhab')).toContainText('Шафиит');
  await expect(attached).toContainText('Контакт туда не попадает');

  // The trap for bots is in the form, but a person neither sees it nor reaches it with Tab.
  const trap = page.locator('input[name="website"]');
  await expect(trap).toHaveCount(1);
  await expect(trap).not.toBeInViewport();
  await expect(trap).toHaveAttribute('tabindex', '-1');
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/Контакт для ответа/)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /\/article\/salat/ })).toBeFocused();

  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Во втором абзаце опечатка.');
  await page.getByLabel(/Контакт для ответа/).fill('reader@example.com');
  const sent = page.waitForRequest((candidate) => candidate.method() === 'POST' && candidate.url().endsWith('/feedback'));
  await page.getByRole('button', { name: 'Отправить' }).click();

  const body = (await sent).postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({
    type: 'ArticleError',
    text: 'Во втором абзаце опечатка.',
    contact: 'reader@example.com',
    pageUrl: '/article/salat?mazhab=shafii',
    mazhab: 'shafii',
    website: '',
  });
  expect(typeof body.articleId).toBe('number');
  expect((await (await sent).response())?.status()).toBe(202);

  const confirmation = page.getByRole('heading', { name: /^Сообщение № \d+ отправлено$/, level: 1 });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toBeFocused();
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('link', { name: 'Вернуться на страницу' }).click();
  await expect(page).toHaveURL(/\/article\/salat\?mazhab=shafii$/);
  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
});

test('a reader on a narrow phone writes from the site footer, and an empty form says what is missing (F-01)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Обратная связь' }).click();

  await expect(page).toHaveURL(/\/feedback\?from=%2F$/);
  await expect(page.getByRole('heading', { name: 'Обратная связь', level: 1 })).toBeVisible();
  await expect(page.getByTestId('feedback-mazhab')).toHaveText('не выбран');
  expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);

  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('radio', { name: 'Ошибка в статье' })).toBeFocused();
  await expect(page.getByText('Выберите, о чём сообщение')).toBeVisible();
  await expect(page.getByText('Напишите текст сообщения.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('radio', { name: 'Идея' }).check();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Добавьте тёмную тему.');
  await expect(page.getByText('21 из 4000')).toBeVisible();
  await page.getByRole('button', { name: 'Отправить' }).click();

  await expect(page.getByRole('heading', { name: /^Сообщение № \d+ отправлено$/, level: 1 })).toBeVisible();
  expect(await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);

  await page.getByRole('button', { name: 'Написать ещё одно' }).click();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue('');
});
