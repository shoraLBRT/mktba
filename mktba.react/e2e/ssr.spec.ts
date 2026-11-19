import { expect, test } from '@playwright/test';

// Public pages are rendered on the server (O-01): their HTML carries the content before any script runs.

test('the server sends an article page with its title, paragraphs and metadata in the HTML', async ({ request }) => {
  const response = await request.get('/article/salat');

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h1[^>]*>Салат<\/h1>/);
  expect(html).toContain('ритуальная молитва, которая является одним из пяти столпов ислама');
  expect(html).toContain('<title>Салат — mktba</title>');
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/article\/salat"/);
});

/** The `content` of a `<meta>` in raw HTML, matched by its `name` or `property`. */
const metaContent = (html: string, key: string): string | null =>
  html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1] ?? null;

test('the server sends an article with Open Graph and Twitter Card tags (O-04)', async ({ request }) => {
  const html = await (await request.get('/article/salat')).text();

  expect(metaContent(html, 'og:site_name')).toBe('mktba');
  expect(metaContent(html, 'og:locale')).toBe('ru_RU');
  expect(metaContent(html, 'og:type')).toBe('article');
  expect(metaContent(html, 'og:title')).toBe('Салат');
  expect(metaContent(html, 'og:url')).toMatch(/^https?:\/\/[^/]+\/article\/salat$/);
  expect(metaContent(html, 'og:image')).toMatch(/^https?:\/\/[^/]+\/.+/);
  expect(metaContent(html, 'description')).toBeTruthy();
  expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
  expect(metaContent(html, 'twitter:title')).toBe('Салат');
  expect(metaContent(html, 'robots')).toBeNull();
  expect(html.match(/<title>/g)).toHaveLength(1);
});

test('the server sends the home page with the site title, description and default image', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html).toContain('<title>mktba — исламская wiki</title>');
  expect(metaContent(html, 'description')).toBe('исламская wiki — мнения четырёх мазхабов в одном месте');
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/"/);
  expect(metaContent(html, 'og:type')).toBe('website');
  expect(metaContent(html, 'og:image')).toMatch(/\/og-default\.png$/);
  expect(metaContent(html, 'robots')).toBeNull();
});

test('the server keeps the 404 page and the sign-in page out of the index', async ({ request }) => {
  const notFound = await (await request.get('/no/such/page')).text();
  expect(notFound).toContain('<title>Страница не найдена — mktba</title>');
  expect(metaContent(notFound, 'robots')).toBe('noindex');
  expect(notFound).not.toContain('rel="canonical"');

  const login = await (await request.get('/admin/login')).text();
  expect(metaContent(login, 'robots')).toBe('noindex, nofollow');

  const admin = await (await request.get('/admin')).text();
  expect(metaContent(admin, 'robots')).toBe('noindex, nofollow');
});

test('the default social image is served', async ({ request }) => {
  const response = await request.get('/og-default.png');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
});

test('client-side navigation keeps one set of metadata tags in the head', async ({ page }) => {
  await page.goto('/no/such/page');
  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveTitle('mktba — исламская wiki');
  await page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
  await expect(page).toHaveTitle('Салат — mktba');

  const head = page.locator('head');
  for (const selector of [
    'title',
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:url"]',
    'meta[name="twitter:card"]',
  ]) {
    await expect(head.locator(selector), selector).toHaveCount(1);
  }
  await expect(head.locator('meta[name="robots"]')).toHaveCount(0);
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
