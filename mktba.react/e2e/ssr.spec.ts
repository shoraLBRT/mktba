import { expect, test } from '@playwright/test';

// Public pages are rendered on the server (O-01): their HTML carries the content before any script runs.

test('the server sends an article page with its title, paragraphs and metadata in the HTML', async ({ request }) => {
  const response = await request.get('/article/salat');

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h1[^>]*>Салат<\/h1>/);
  expect(html).toContain('ритуальная молитва, которая является одним из пяти столпов ислама');
  expect(html).toContain('<title>Салат</title>');
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/article\/salat"/);
});

test('the server sends the opinions of every mazhab, not only the shown one (O-03)', async ({ request }) => {
  const html = await (await request.get('/article/salat')).text();

  for (const text of [
    'время Фаджра начинается с истинного рассвета',
    'Малики согласны с основными временами',
    'Шафииты используют сходные временные интервалы',
    'Ханбалиты следуют близким расчётам',
  ]) {
    expect(html).toContain(text);
  }
  expect(html).toMatch(/role="tabpanel"[^>]*hidden=""/);
});

test('a link with a mazhab parameter keeps the canonical on the clean article URL', async ({ request }) => {
  const html = await (await request.get('/article/salat?mazhab=shafii')).text();

  expect(html).toMatch(/<link rel="canonical" href="[^"?]*\/article\/salat"/);
});

test('a reader sees only one opinion of a block and switches it with the arrow keys', async ({ page }) => {
  await page.goto('/article/salat');
  const firstSlot = page.getByRole('tablist', { name: 'Мазхабы:' }).first();
  const hanafiTab = firstSlot.getByRole('tab', { name: 'Мнение мазхаба: Ханафитский мазхаб' });
  await expect(page.getByText(/время Фаджра начинается с истинного рассвета/)).toBeVisible();
  await expect(page.getByText(/Малики согласны с основными временами/)).toBeHidden();

  await hanafiTab.focus();
  await page.keyboard.press('ArrowRight');

  await expect(firstSlot.getByRole('tab', { name: 'Мнение мазхаба: Маликитский мазхаб' })).toBeFocused();
  await expect(page.getByText(/Малики согласны с основными временами/)).toBeVisible();
  await expect(page.getByText(/время Фаджра начинается с истинного рассвета/)).toBeHidden();
});

test('an article page reads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/article/salat');

  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
  await expect(page.getByText(/ритуальная молитва/).first()).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true })).toBeVisible();
  await context.close();
});

test('the server answers 404 for an unknown article and an unknown page', async ({ request }) => {
  const article = await request.get('/article/no-such-article');
  expect(article.status()).toBe(404);
  expect(await article.text()).toContain('Страница не найдена');

  const page = await request.get('/no/such/page');
  expect(page.status()).toBe(404);
});

test('the server leaves the admin to the browser', async ({ request }) => {
  const response = await request.get('/admin');

  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain('Разделы админки');
});
