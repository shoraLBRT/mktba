import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminCredentials } from './helpers';

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

const API_URL = 'http://localhost:5172';

/** Creates an article through the API as the e2e admin and publishes it; returns its id and slug. */
const publishArticle = async (request: APIRequestContext, title: string, paragraphs: unknown[]) => {
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  expect(login.ok()).toBe(true);
  const { accessToken } = await login.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const created = await request.post(`${API_URL}/articles/content`, { headers, data: { title, paragraphs } });
  expect(created.status()).toBe(201);
  const article = await created.json() as { id: number; slug: string };
  for (const status of ['InReview', 'Published']) {
    expect((await request.post(`${API_URL}/articles/${article.id}/status`, { headers, data: { status } })).ok()).toBe(true);
  }
  return { ...article, headers };
};

test('the server answers 410 with a non-indexed page for a deleted article (O-07)', async ({ request }) => {
  const article = await publishArticle(request, `Удаляемая статья ${Date.now()}`, [
    { order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] },
  ]);
  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).status()).toBe(204);

  const response = await request.get(`/article/${article.slug}`, { maxRedirects: 0 });

  expect(response.status()).toBe(410);
  const html = await response.text();
  expect(html).toContain('Статья удалена');
  expect(metaContent(html, 'robots')).toContain('noindex');
});

test('the server marks a published stub without content noindex and leaves it out of the sitemap (O-07)', async ({ request }) => {
  const stub = await publishArticle(request, `Заглушка ${Date.now()}`, []);

  const response = await request.get(`/article/${stub.slug}`);

  expect(response.status()).toBe(200);
  expect(metaContent(await response.text(), 'robots')).toContain('noindex');
  expect(metaContent(await (await request.get('/article/salat')).text(), 'robots')).toBeNull();
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/article/${stub.slug}<`);
});

test('the server leaves the admin to the browser', async ({ request }) => {
  const response = await request.get('/admin');

  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain('Разделы админки');
});

type JsonLdNode = Record<string, unknown> & { '@type': string };

/** Every JSON-LD graph node in raw HTML (O-05). */
const jsonLdNodes = (html: string): JsonLdNode[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)]
    .flatMap((match) => (JSON.parse(match[1]) as { '@graph': JsonLdNode[] })['@graph']);

test('the server sends an article with Article, BreadcrumbList, WebSite and Organization JSON-LD (O-05)', async ({ request }) => {
  const html = await (await request.get('/article/salat')).text();
  const nodes = jsonLdNodes(html);

  expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList']);
  const [organization, , article, breadcrumbs] = nodes;
  expect(organization).toMatchObject({ name: 'mktba' });
  expect(article.headline).toBe('Салат');
  expect(article.url).toMatch(/^https?:\/\/[^/]+\/article\/salat$/);
  expect(article.datePublished).toBeTruthy();
  expect(article.author).toEqual({ '@id': organization['@id'] });
  const trail = breadcrumbs.itemListElement as Array<{ position: number; name: string; item: string }>;
  expect(trail.at(-1)).toMatchObject({ position: trail.length, name: 'Салат', item: article.url });
});

test('the server sends the home page with Organization and WebSite JSON-LD and no search action (O-05)', async ({ request }) => {
  const nodes = jsonLdNodes(await (await request.get('/')).text());

  expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
  expect(nodes[1]).not.toHaveProperty('potentialAction');
});
