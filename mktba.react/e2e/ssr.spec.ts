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
