import { expect, test } from '@playwright/test';
import { adminCredentials, API_URL, publishArticle } from './helpers';

// Public pages are rendered on the server (O-01): their HTML carries the content before any script runs.

test('the server sends an article page with its title, paragraphs and metadata in the HTML', async ({ request }) => {
  const response = await request.get('/salat');

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h1[^>]*>Салат<\/h1>/);
  expect(html).toContain('ритуальная молитва, которая является одним из пяти столпов ислама');
  expect(html).toContain('<title>Салат — mktba</title>');
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/salat"/);
});

test('the server answers old article URLs with 301 to /{slug}, keeping the query (O-02)', async ({ request }) => {
  const bySlug = await request.get('/article/salat?mazhab=shafii', { maxRedirects: 0 });
  expect(bySlug.status()).toBe(301);
  expect(bySlug.headers()['location']).toBe('/salat?mazhab=shafii');

  const article = await publishArticle(request, `Старая ссылка ${Date.now()}`, [
    { order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] },
  ]);
  const byId = await request.get(`/article/${article.id}`, { maxRedirects: 0 });
  expect(byId.status()).toBe(301);
  expect(byId.headers()['location']).toBe(`/${article.slug}`);

  const search = await request.get('/search', { maxRedirects: 0 });
  expect(search.status()).toBe(200);
  expect(await search.text()).not.toContain('Страница не найдена');
});

test('the server sends an article page with one h1, its landmarks and machine-readable dates (O-10)', async ({ request }) => {
  const html = await (await request.get('/salat')).text();

  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  expect(html.match(/<main[\s>]/g)).toHaveLength(1);
  expect(html).toMatch(/<main[\s\S]*<article[\s>][\s\S]*<h1/);
  expect(html).toMatch(/<header[\s>]/);
  expect(html).toMatch(/<nav aria-label="Статьи"/);
  expect(html).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}T[^"]+Z">/i);
});

test('the server sends the home page with its sections and new articles in the HTML (R-05)', async ({ request }) => {
  const response = await request.get('/');

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h2[^>]*>Разделы<\/h2>/);
  expect(html).toMatch(/<h2[^>]*>Новые статьи<\/h2>[\s\S]*?<a[^>]*href="\/[^"]+"/);
  expect(html).toMatch(/<h2[^>]*>Что такое mktba<\/h2>/);
  expect(html).toContain('<title>mktba — исламская wiki</title>');
});

test('the server sends the home page with exactly one h1 inside main (O-10)', async ({ request }) => {
  const html = await (await request.get('/')).text();

  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  expect(html).toMatch(/<main[\s>][\s\S]*<h1/);
});

/** The `content` of a `<meta>` in raw HTML, matched by its `name` or `property`. */
const metaContent = (html: string, key: string): string | null =>
  html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1] ?? null;

test('the server sends an article with Open Graph and Twitter Card tags (O-04)', async ({ request }) => {
  const html = await (await request.get('/salat')).text();

  expect(metaContent(html, 'og:site_name')).toBe('mktba');
  expect(metaContent(html, 'og:locale')).toBe('ru_RU');
  expect(metaContent(html, 'og:type')).toBe('article');
  expect(metaContent(html, 'og:title')).toBe('Салат');
  expect(metaContent(html, 'og:url')).toMatch(/^https?:\/\/[^/]+\/salat$/);
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

test('the server sends the icons, the manifest and the theme colour on public, admin and error pages (O-13)', async ({ request }) => {
  for (const url of ['/', '/salat', '/admin/login', '/admin', '/no/such/page']) {
    const html = await (await request.get(url)).text();

    expect(html, url).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32"/>');
    expect(html, url).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>');
    expect(html, url).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>');
    expect(html, url).toContain('<link rel="manifest" href="/site.webmanifest"/>');
    expect(metaContent(html, 'theme-color'), url).toBe('#2d6a4f');
    expect(html, url).not.toContain('vite.svg');
  }
});

test('the favicon, the manifest and its icons are served with their content types (O-13)', async ({ request }) => {
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect(ico.headers()['content-type']).toMatch(/^image\/(x-icon|vnd\.microsoft\.icon)/);
  const icoBody = await ico.body();
  const icoSizes = Array.from({ length: icoBody.readUInt16LE(4) }, (_, index) => icoBody.readUInt8(6 + 16 * index));
  expect(icoSizes).toEqual(expect.arrayContaining([16, 32]));

  const svg = await request.get('/favicon.svg');
  expect(svg.headers()['content-type']).toContain('image/svg+xml');

  const manifestResponse = await request.get('/site.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await manifestResponse.json()) as { icons: { src: string; sizes: string }[] };

  for (const { src, sizes } of [...manifest.icons, { src: '/apple-touch-icon.png', sizes: '180x180' }]) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type'], src).toContain('image/png');
    const png = await icon.body();
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, src).toBe(sizes);
  }
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
  const html = await (await request.get('/salat')).text();

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
  const html = await (await request.get('/salat?mazhab=shafii')).text();

  expect(html).toMatch(/<link rel="canonical" href="[^"?]*\/salat"/);
  // The schools still reach the server render: tabs are named after them, not left as common opinions.
  expect(html).toMatch(/role="tab"[^>]*>Шафииты</);
});

test('a reader sees only one opinion of a block and switches it with the arrow keys', async ({ page }) => {
  await page.goto('/salat');
  const firstSlot = page.getByRole('tablist', { name: 'Мазхабы:' }).first();
  const hanafiTab = firstSlot.getByRole('tab', { name: 'Ханафиты' });
  await expect(page.getByText(/время Фаджра начинается с истинного рассвета/)).toBeVisible();
  await expect(page.getByText(/Малики согласны с основными временами/)).toBeHidden();

  await hanafiTab.focus();
  await page.keyboard.press('ArrowRight');

  await expect(firstSlot.getByRole('tab', { name: 'Маликиты' })).toBeFocused();
  await expect(page.getByText(/Малики согласны с основными временами/)).toBeVisible();
  await expect(page.getByText(/время Фаджра начинается с истинного рассвета/)).toBeHidden();
});

test('an article page reads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/salat');

  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();
  // The summary in the closed mobile overview (R-11) matches too; the visible match is the text.
  await expect(page.getByText(/ритуальная молитва/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('complementary').getByRole('link', { name: 'Салат', exact: true })).toBeVisible();
  await context.close();
});

test('the server answers 404 for an unknown article and an unknown page', async ({ request }) => {
  const article = await request.get('/no-such-article');
  expect(article.status()).toBe(404);
  expect(await article.text()).toContain('Страница не найдена');

  const page = await request.get('/no/such/page');
  expect(page.status()).toBe(404);
});

test('the server answers 410 with a non-indexed page for a deleted article (O-07)', async ({ request }) => {
  const article = await publishArticle(request, `Удаляемая статья ${Date.now()}`, [
    { order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] },
  ]);
  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).status()).toBe(204);

  const response = await request.get(`/${article.slug}`, { maxRedirects: 0 });

  expect(response.status()).toBe(410);
  const html = await response.text();
  expect(html).toContain('Статья удалена');
  expect(metaContent(html, 'robots')).toContain('noindex');
});

test('the server marks a published stub without content noindex and leaves it out of the sitemap (O-07)', async ({ request }) => {
  const stub = await publishArticle(request, `Заглушка ${Date.now()}`, null);

  const response = await request.get(`/${stub.slug}`);

  expect(response.status()).toBe(200);
  expect(metaContent(await response.text(), 'robots')).toContain('noindex');
  expect(metaContent(await (await request.get('/salat')).text(), 'robots')).toBeNull();
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain(`/${stub.slug}<`);
});

/** The steps of the article's breadcrumb trail in raw HTML, in order (R-06). */
const breadcrumbSteps = (html: string): string[] => {
  const trail = /<nav[^>]*data-testid="article-breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
  return [...trail.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((step) => step[1].replace(/<[^>]+>/g, '').trim());
};

test('the server sends the article header: breadcrumbs for a stub too, and the reading time of a text (R-06)', async ({ request }) => {
  const title = `Заглушка шапки ${Date.now()}`;
  const stub = await publishArticle(request, title, null);

  const stubHtml = await (await request.get(`/${stub.slug}`)).text();
  const articleHtml = await (await request.get('/salat')).text();

  expect(breadcrumbSteps(stubHtml)).toEqual(['Главная', title]);
  expect(stubHtml).not.toContain('data-testid="article-reading-time"');
  expect(breadcrumbSteps(articleHtml).at(0)).toBe('Главная');
  expect(breadcrumbSteps(articleHtml).at(-1)).toBe('Салат');
  expect(articleHtml).toMatch(/data-testid="article-reading-time"[^>]*>.*?\d+ мин чтения/);
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
  // The seeded article is the e2e admin's; other specs give the admin a name, which would make the
  // author a Person (P-06). Without a name the site itself is the author.
  const login = await request.post(`${API_URL}/auth/login`, { data: adminCredentials() });
  const { accessToken } = await login.json() as { accessToken: string };
  expect((await request.put(`${API_URL}/profile`, { headers: { Authorization: `Bearer ${accessToken}` }, data: { displayName: null } })).ok()).toBe(true);

  const html = await (await request.get('/salat')).text();
  const nodes = jsonLdNodes(html);

  expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList']);
  const [organization, , article, breadcrumbs] = nodes;
  expect(organization).toMatchObject({ name: 'mktba' });
  expect(article.headline).toBe('Салат');
  expect(article.url).toMatch(/^https?:\/\/[^/]+\/salat$/);
  expect(article.datePublished).toBeTruthy();
  expect(article.author).toEqual({ '@id': organization['@id'] });
  expect(html).not.toContain('data-testid="article-authors"');
  const trail = breadcrumbs.itemListElement as Array<{ position: number; name: string; item: string }>;
  expect(trail.at(-1)).toMatchObject({ position: trail.length, name: 'Салат', item: article.url });
});

test('the server sends the home page with Organization and WebSite JSON-LD naming the site search (O-05, R-10)', async ({ request }) => {
  const nodes = jsonLdNodes(await (await request.get('/')).text());

  expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
  const action = nodes[1].potentialAction as { '@type': string; target: { urlTemplate: string } };
  expect(action['@type']).toBe('SearchAction');
  expect(new URL(action.target.urlTemplate.replace('{search_term_string}', 'x')).pathname).toBe('/search');
  expect(action.target.urlTemplate.endsWith('/search?q={search_term_string}')).toBe(true);
});

/** The inner HTML of one block of the article footer in raw HTML (R-08). */
const footerBlock = (html: string, testId: string): string =>
  new RegExp(`<nav[^>]*data-testid="${testId}"[^>]*>([^]*?)</nav>`).exec(html)?.[1] ?? '';

const linkedSlugs = (blockHtml: string): string[] =>
  [...blockHtml.matchAll(/href="\/([^"]+)"/g)].map((match) => match[1]);

test('the server sends the article footer: children, related and neighbours, without drafts and with stubs unlinked (R-08)', async ({ request }) => {
  const stamp = Date.now();
  const text = [{ order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] }];
  const section = await publishArticle(request, `Раздел низа ${stamp}`, text);
  const inSection = { parentArticleId: section.id };
  const first = await publishArticle(request, `Первая низа ${stamp}`, text, inSection);
  const stub = await publishArticle(request, `Заглушка низа ${stamp}`, null, inSection);
  const draft = await request.post(`${API_URL}/articles/content`, {
    headers: section.headers,
    data: { title: `Черновик низа ${stamp}`, paragraphs: text, ...inSection },
  });
  expect(draft.status()).toBe(201);
  const draftSlug = (await draft.json() as { slug: string }).slug;
  const last = await publishArticle(request, `Последняя низа ${stamp}`, text, {
    ...inSection,
    relatedLinks: [{ relatedArticleId: first.id, order: 1 }],
  });

  const sectionHtml = await (await request.get(`/${section.slug}`)).text();
  const firstHtml = await (await request.get(`/${first.slug}`)).text();
  const lastHtml = await (await request.get(`/${last.slug}`)).text();
  const stubHtml = await (await request.get(`/${stub.slug}`)).text();

  const children = footerBlock(sectionHtml, 'article-children');
  expect(children).toContain('<h2');
  expect(linkedSlugs(children)).toEqual([first.slug, last.slug]);
  expect(children).toContain(`Заглушка низа ${stamp}`);
  expect(sectionHtml).not.toContain(draftSlug);
  expect(sectionHtml).not.toContain(`Черновик низа ${stamp}`);

  // Neighbours follow the tree and step over the stub and the draft.
  expect(linkedSlugs(footerBlock(firstHtml, 'article-adjacent'))).toEqual([section.slug, last.slug]);
  expect(footerBlock(firstHtml, 'article-adjacent')).toMatch(/rel="prev"[\s\S]*rel="next"/);
  expect(linkedSlugs(footerBlock(lastHtml, 'article-adjacent')).at(0)).toBe(first.slug);
  expect(linkedSlugs(footerBlock(stubHtml, 'article-adjacent')).slice(0, 2)).toEqual([first.slug, last.slug]);
  expect(firstHtml).not.toContain('data-testid="article-children"');

  expect(linkedSlugs(footerBlock(lastHtml, 'article-related'))).toEqual([first.slug]);
  expect(firstHtml).not.toContain('data-testid="article-related"');
  // The footer's headings are not part of the article's outline.
  expect(lastHtml.match(/<h1[\s>]/g)).toHaveLength(1);
});

test('the server sends the search results with the matched words marked and keeps the page out of the index (R-10)', async ({ request }) => {
  // «столпами» is another form of the seeded article's «столпов»: the Russian morphology is at work.
  const response = await request.get(`/search?q=${encodeURIComponent('столпами ислама')}`);

  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('<title>Поиск: столпами ислама — mktba</title>');
  expect(metaContent(html, 'robots')).toBe('noindex');
  expect(html).not.toContain('rel="canonical"');
  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  expect(html).toMatch(/<ol aria-label="Результаты поиска"[\s\S]*href="\/salat(#p-\d+)?"/);
  expect(html).toMatch(/<mark[^>]*>столпов<\/mark>/);
});

test('the server says so when nothing is found and asks for a query when there is none (R-10)', async ({ request }) => {
  const nothing = await request.get('/search?q=abrakadabraksis');
  expect(nothing.status()).toBe(200);
  expect(await nothing.text()).toContain('ничего не найдено');

  const noQuery = await (await request.get('/search')).text();
  expect(noQuery).toContain('Введите запрос');
  expect(noQuery).toContain('<title>Поиск — mktba</title>');
});

test('pages and client navigation data carry the security headers, and the page still hydrates (X-06)', async ({ page, request }) => {
  for (const path of ['/salat', '/salat.data']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toMatch(/frame-ancestors 'self' https:\/\/metrika\.yandex\.ru/);
  }

  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto('/salat');
  await page.waitForLoadState('networkidle');
  expect(violations).toEqual([]);
});

test('the language is in the URL: / is Russian, /en/ is English and stays out of the index until its dictionary (I-01)', async ({ request }) => {
  const russian = await (await request.get('/salat')).text();
  expect(russian).toMatch(/<html lang="ru"/);

  const home = await request.get('/en/');
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toMatch(/<html lang="en"/);
  expect(metaContent(html, 'og:locale')).toBe('en_US');
  expect(metaContent(html, 'robots')).toContain('noindex');
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/en\/"/);

  // A slug is unique within a language: the Russian article is not at /en/{its slug}.
  expect((await request.get('/en/salat')).status()).toBe(404);
});

test('an English article lives under /en/ and its old id link leads there (I-01)', async ({ request }) => {
  const article = await publishArticle(request, `Prayer ${Date.now()}`, [
    { order: 1, opinions: [{ content: 'Text', isDefault: true, schoolIds: [] }] },
  ], { locale: 'en' });

  const page = await request.get(`/en/${article.slug}`, { maxRedirects: 0 });
  expect(page.status()).toBe(200);
  expect(await page.text()).toMatch(/<h1[^>]*>Prayer \d+<\/h1>/);

  const byId = await request.get(`/article/${article.id}`, { maxRedirects: 0 });
  expect(byId.status()).toBe(301);
  expect(byId.headers()['location']).toBe(`/en/${article.slug}`);

  expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
});

test('language versions of an article link each other with hreflang in the page and in the sitemap (O-08)', async ({ request }) => {
  const paragraphs = [{ order: 1, opinions: [{ content: 'Text', isDefault: true, schoolIds: [] }] }];
  const russian = await publishArticle(request, `Namaz ${Date.now()}`, paragraphs);
  const english = await publishArticle(request, `Prayer ${Date.now()}`, paragraphs, { translationOfId: russian.id, locale: 'en' });
  const hreflang = (html: string) => [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/gi)]
    .map((match) => `${match[1]} ${new URL(match[2]).pathname}`);
  const expected = [`ru /${russian.slug}`, `en /en/${english.slug}`, `x-default /${russian.slug}`];

  const russianHtml = await (await request.get(`/${russian.slug}`)).text();
  expect(hreflang(russianHtml)).toEqual(expected);
  const englishHtml = await (await request.get(`/en/${english.slug}`)).text();
  expect(hreflang(englishHtml)).toEqual(expected);
  // An English article is indexed now; an English list page still is not (#110, #112).
  expect(metaContent(englishHtml, 'robots')).toBeNull();
  expect(metaContent(await (await request.get('/en/')).text(), 'robots')).toContain('noindex');

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`/en/${english.slug}</loc>`);
  expect(sitemap).toMatch(new RegExp(`hreflang="en" href="[^"]+/en/${english.slug}"`));

  for (const article of [english, russian]) {
    expect((await request.delete(`${API_URL}/articles/${article.id}`, { headers: article.headers })).ok()).toBe(true);
  }
});
