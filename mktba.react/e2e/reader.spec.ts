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

test('the mazhab picker sits in the header and explains itself once on the first visit (R-03)', async ({ page }) => {
  await page.goto('/article/salat');
  const hint = page.getByRole('banner').getByRole('note');
  await expect(hint).toContainText('Мазхаб — школа исламского права');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Мазхаб не выбран' })).toBeVisible();

  await hint.getByRole('button', { name: 'Закрыть подсказку' }).click();
  await expect(hint).toBeHidden();

  await page.reload();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Мазхаб не выбран' })).toBeVisible();
  await expect(page.getByRole('note')).toHaveCount(0);
});

test('a link with a mazhab opens the article with it and leaves the reader their own choice (R-03)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/article/salat');
  await page.getByRole('button', { name: 'Мазхаб не выбран' }).click();
  await page.getByRole('button', { name: /Шафиитский мазхаб/ }).click();
  await page.getByRole('button', { name: 'Шафиитский мазхаб' }).click();
  await page.getByRole('button', { name: 'Скопировать ссылку с этим мазхабом' }).click();
  await expect(page.getByText('Ссылка скопирована')).toBeVisible();
  const link = await page.evaluate<string>('navigator.clipboard.readText()');
  expect(link).toMatch(/\/article\/salat\?mazhab=shafii$/);

  // The recipient has a mazhab of their own: the link wins on this page only.
  await page.getByRole('button', { name: /Ханафитский мазхаб/ }).click();
  const saved = await page.evaluate(() => localStorage.getItem('mktba.mazhab'));
  await page.goto(link);

  const firstSlot = page.getByRole('tablist', { name: 'Мазхабы:' }).first();
  await expect(firstSlot.getByRole('tab', { name: /^Шафииты.*ваш мазхаб$/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Шафиитский мазхаб' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mktba.mazhab'))).toBe(saved);

  // Choosing by hand saves the choice and drops the parameter.
  await page.getByRole('button', { name: 'Шафиитский мазхаб' }).click();
  await page.getByRole('button', { name: /Маликитский мазхаб/ }).click();
  await expect(page).toHaveURL(/\/article\/salat$/);
  await expect(firstSlot.getByRole('tab', { name: /^Маликиты.*ваш мазхаб$/ })).toHaveAttribute('aria-selected', 'true');
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

test('the infobox never overlaps the text or overflows, and collapses on a phone (R-04)', async ({ page, request }) => {
  const unbroken = `https://example.org/${'ochen-dlinnaya-ssylka-'.repeat(6)}`;
  const article = await publishArticle(
    request,
    `Инфобокс ${Date.now()}`,
    [
      { order: 1, opinions: [{ content: `Вступление. ${'Обычный текст абзаца. '.repeat(20)}`, isDefault: true, schoolIds: [] }] },
      {
        order: 2,
        opinions: [
          { content: 'Первое мнение блока', isDefault: true, schoolIds: [] },
          { content: 'Второе мнение блока', isDefault: false, schoolIds: [] },
        ],
      },
      { order: 3, opinions: [{ content: `## Раздел\n\n${'Ещё текст. '.repeat(40)}`, isDefault: true, schoolIds: [] }] },
    ],
    {
      infobox: {
        title: 'الصلاة',
        subtitle: 'Салят',
        fields: [
          { order: 1, key: 'translit', label: 'Транслитерация', value: 'Достопримечательность-без-пробелов' },
          { order: 2, key: 'source', label: 'Источник', value: unbroken },
          { order: 3, key: 'type', label: 'Тип', value: 'Столп ислама' },
        ],
      },
    },
  );
  const url = `/article/${article.slug}`;

  // Collapsed or not, the facts are in the server HTML.
  expect(await (await request.get(url)).text()).toContain('Столп ислама');

  const infobox = page.getByRole('complementary', { name: 'الصلاة' });
  const body = infobox.getByTestId('infobox-body');
  type Box = { left: number; right: number; top: number; bottom: number };
  type Layout = { pageOverflow: number; infoboxOverflow: number; column: Box; infobox: Box; blocks: Box[] };
  // Runs in the page (the e2e project compiles without DOM types, hence a script string).
  const layout = () => page.evaluate<Layout>(`(() => {
    const box = (element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const aside = document.querySelector('#article-overview aside');
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      infoboxOverflow: aside.scrollWidth - aside.clientWidth,
      column: box(aside.closest('.\\\\@container')),
      infobox: box(aside),
      blocks: [
        ...[...document.querySelectorAll('article [role="tablist"]')].map((tablist) => tablist.closest('section')),
        ...document.querySelectorAll('article .article-markdown h2'),
      ].map(box),
    };
  })()`);

  for (const width of [320, 390, 640, 768, 1024, 1280, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await expect(infobox).toBeVisible();
    const seen = await layout();

    expect(seen.pageOverflow, `page scrolls sideways at ${width}`).toBeLessThanOrEqual(0);
    expect(seen.infoboxOverflow, `infobox content is clipped at ${width}`).toBeLessThanOrEqual(0);
    expect(seen.infobox.left, `infobox leaves the column at ${width}`).toBeGreaterThanOrEqual(seen.column.left - 0.5);
    expect(seen.infobox.right, `infobox leaves the column at ${width}`).toBeLessThanOrEqual(seen.column.right + 0.5);
    expect(seen.blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of seen.blocks) {
      const apart = block.left >= seen.infobox.right || block.right <= seen.infobox.left
        || block.top >= seen.infobox.bottom || block.bottom <= seen.infobox.top;
      expect(apart, `infobox overlaps a block at ${width}`).toBe(true);
    }
    const floated = seen.infobox.right - seen.infobox.left < seen.column.right - seen.column.left;
    expect(floated, `infobox floats beside the text only in a wide column (${width})`).toBe(width >= 768);
    if (width < 640) {
      await expect(body).toBeHidden();
    } else {
      await expect(body).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(url);
  await infobox.getByRole('button', { name: 'Показать сведения' }).click();
  await expect(body).toBeVisible();
  await expect(body).toContainText('Столп ислама');
  expect((await layout()).infoboxOverflow).toBeLessThanOrEqual(0);
  await infobox.getByRole('button', { name: 'Скрыть сведения' }).click();
  await expect(body).toBeHidden();
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

test('the home page offers sections, new and updated articles and a title search (R-05)', async ({ page, request }) => {
  const title = `Главная новинка ${Date.now()}`;
  const article = await publishArticle(request, title, [
    { order: 1, opinions: [{ content: 'Текст новой статьи', isDefault: true, schoolIds: [] }] },
  ]);

  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'mktba — исламская wiki', level: 1 })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Разделы' }).getByRole('link').first()).toBeVisible();
  await expect(main.getByRole('region', { name: 'Что такое mktba' })).toContainText('открытая исламская wiki');
  const fresh = main.getByRole('region', { name: 'Новые статьи' });
  await expect(fresh.getByRole('listitem').first().getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Обновлённые статьи' }).getByRole('link', { name: title, exact: true })).toHaveCount(0);

  const content = await (await request.get(`${API_URL}/articles/${article.id}/content`, { headers: article.headers })).json();
  const saved = await request.put(`${API_URL}/articles/${article.id}/content`, {
    headers: article.headers,
    data: { ...content, summary: 'Описание, добавленное после публикации' },
  });
  expect(saved.ok()).toBe(true);

  await page.reload();
  const updated = main.getByRole('region', { name: 'Обновлённые статьи' }).getByRole('listitem').first();
  await expect(updated.getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(updated).toContainText('Описание, добавленное после публикации');

  await main.getByRole('searchbox', { name: 'Найти статью по названию' }).fill('главная новинка');
  await main.getByRole('list', { name: 'Найденные статьи' }).getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/article/${article.slug}$`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
});

test('the home page has no serious or critical accessibility violations (R-05)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('region', { name: 'Разделы' })).toBeVisible();

  // Colour contrast is R-17 (#141); the rest must stay clean.
  const { violations } = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);

  expect(serious).toEqual([]);
});

test('the table of contents follows the scroll, headings and paragraphs have links, and a button leads back up (R-07)', async ({ page, request }) => {
  const schools = await (await request.get(`${API_URL}/schools/system`)).json() as { id: number; slug: string }[];
  const shafiiId = schools.find((school) => school.slug === 'shafii')!.id;
  const filler = 'Текст раздела для прокрутки. '.repeat(250);
  const article = await publishArticle(request, `Оглавление ${Date.now()}`, [
    { order: 1, opinions: [{ content: `Вступление без заголовка. ${filler}`, isDefault: true, schoolIds: [] }] },
    { order: 2, opinions: [{ content: `## Условия\n\n${filler}\n\n### Ният\n\n${filler}`, isDefault: true, schoolIds: [] }] },
    {
      order: 3,
      opinions: [
        { content: `## Общий раздел\n\n${filler}`, isDefault: true, schoolIds: [] },
        { content: `## Раздел шафиитов\n\n${filler}`, isDefault: false, schoolIds: [shafiiId] },
      ],
    },
    { order: 4, opinions: [{ content: `## Условия\n\n${filler}`, isDefault: true, schoolIds: [] }] },
  ]);
  const path = `/article/${article.slug}`;

  // The anchors are in the server HTML: paragraph ids, heading slugs, a repeated heading numbered.
  const html = await (await request.get(path)).text();
  for (const id of ['usloviya', 'niyat', 'obshchiy-razdel', 'usloviya-2']) {
    expect(html).toContain(`id="${id}"`);
  }
  expect(html).toMatch(/<section[^>]* id="p-\d+"/);
  expect(html).not.toContain('id="razdel-shafiitov"');

  await page.goto(path);
  const toc = page.getByRole('navigation', { name: 'На этой странице' });
  await expect(toc.getByRole('link')).toHaveText(['Общее описание', 'Условия', 'Ният', 'Общий раздел', 'Условия']);
  await expect(toc.getByRole('link', { name: 'Общее описание' })).toHaveAttribute('aria-current', 'location');
  await expect(page.getByRole('button', { name: 'Наверх' })).toBeHidden();
  // A late web font re-wraps the text and moves the sections; wait it out before measuring.
  await page.evaluate('document.fonts.ready');

  // A table of contents entry jumps to its section and becomes the current one.
  await toc.getByRole('link', { name: 'Ният' }).click();
  await expect(page).toHaveURL(/#niyat$/);
  await expect(page.getByRole('heading', { name: 'Ният', level: 3 })).toBeInViewport();
  await expect(toc.getByRole('link', { name: 'Ният' })).toHaveAttribute('aria-current', 'location');
  await expect(toc.locator('[aria-current]')).toHaveCount(1);

  // Scrolling on moves the highlight; at the end of the page the last section is current.
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await expect(toc.getByRole('link', { name: 'Условия' }).last()).toHaveAttribute('aria-current', 'location');

  // The button leads back to the top and goes away there.
  await page.getByRole('button', { name: 'Наверх' }).click();
  await expect.poll(() => page.evaluate<number>('window.scrollY')).toBe(0);
  await expect(page.getByRole('button', { name: 'Наверх' })).toBeHidden();

  // A heading and a paragraph each carry a link to themselves.
  await page.getByRole('link', { name: 'Ссылка на раздел «Общий раздел»' }).click();
  await expect(page).toHaveURL(/#obshchiy-razdel$/);
  await expect(page.getByRole('heading', { name: 'Общий раздел', exact: true })).toBeInViewport();
  await page.getByRole('link', { name: 'Ссылка на абзац 1' }).click();
  await expect(page).toHaveURL(/#p-\d+$/);
  await expect(page.getByText('Вступление без заголовка.')).toBeInViewport();

  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)).toEqual([]);

  // A mazhab link with an anchor: the heading exists only in that mazhab's opinion, so the page
  // goes to it once the mazhab is applied.
  await page.goto(`${path}?mazhab=shafii#razdel-shafiitov`);
  await expect(page.getByRole('heading', { name: 'Раздел шафиитов', exact: true })).toBeInViewport();
  await expect(page.getByRole('navigation', { name: 'На этой странице' }).getByRole('link', { name: 'Раздел шафиитов' }))
    .toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveURL(/\?mazhab=shafii#razdel-shafiitov$/);
});

test('the bottom of an article leads to its children and neighbours and stays accessible on a narrow screen (R-08)', async ({ page, request }) => {
  const stamp = Date.now();
  const text = [{ order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] }];
  const section = await publishArticle(request, `Раздел перехода ${stamp}`, text);
  const child = await publishArticle(request, `Глава перехода ${stamp}`, text, {
    parentArticleId: section.id,
    relatedLinks: [{ relatedArticleId: section.id, order: 1 }],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/article/${section.slug}`);
  await page.getByRole('navigation', { name: 'В этом разделе' }).getByRole('link', { name: `Глава перехода ${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/article/${child.slug}$`));
  await expect(page.getByRole('heading', { name: `Глава перехода ${stamp}`, level: 1 })).toBeVisible();

  const related = page.getByRole('navigation', { name: 'Связанные статьи' });
  await expect(related.getByRole('link', { name: `Раздел перехода ${stamp}` })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)).toEqual([]);

  await page.getByRole('navigation', { name: 'Соседние статьи' }).getByRole('link', { name: /Предыдущая статья/ }).click();
  await expect(page).toHaveURL(new RegExp(`/article/${section.slug}$`));
  await expect(page.getByRole('heading', { name: `Раздел перехода ${stamp}`, level: 1 })).toBeVisible();

  // On a wide screen the related articles live in the right sidebar only.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/article/${child.slug}`);
  await expect(page.getByRole('navigation', { name: 'Связанные статьи' })).toHaveCount(1);
  await expect(page.getByTestId('article-related')).toBeHidden();
});

test('the navigation tree remembers collapsed sections, opens the path to the current article and follows the arrow keys (R-09)', async ({ page, request }) => {
  const stamp = Date.now();
  const text = [{ order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] }];
  const section = await publishArticle(request, `Раздел дерева ${stamp}`, text);
  const chapter = await publishArticle(request, `Глава дерева ${stamp}`, text, { parentArticleId: section.id });
  const leaf = await publishArticle(request, `Параграф дерева ${stamp}`, text, { parentArticleId: chapter.id });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const tree = page.getByRole('complementary').getByRole('navigation', { name: 'Статьи' });
  const link = (title: string) => tree.getByRole('link', { name: title, exact: true });
  const sectionLink = link(`Раздел дерева ${stamp}`);
  const chapterLink = link(`Глава дерева ${stamp}`);
  const leafLink = link(`Параграф дерева ${stamp}`);
  const sectionRow = sectionLink.locator('..');

  await expect(leafLink).toBeVisible();
  await expect(sectionRow.getByText('Подразделов: 1')).toBeAttached();

  // The toggle answers once the page is hydrated.
  await expect(async () => {
    await sectionRow.getByRole('button', { name: 'Свернуть раздел' }).click({ timeout: 1000 });
    await expect(chapterLink).toBeHidden({ timeout: 1000 });
  }).toPass();

  await page.reload();
  await expect(sectionRow.getByRole('button', { name: 'Развернуть раздел' })).toHaveAttribute('aria-expanded', 'false');
  await expect(chapterLink).toBeHidden();

  // Arrow keys: right expands and steps in, down walks on, left collapses and steps out.
  await sectionLink.focus();
  await page.keyboard.press('ArrowRight');
  await expect(chapterLink).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(chapterLink).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(leafLink).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(chapterLink).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(leafLink).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(sectionLink).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(chapterLink).toBeHidden();

  const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)).toEqual([]);

  // Opening the leaf directly expands both collapsed ancestors and marks the leaf.
  await page.goto(`/article/${leaf.slug}`);
  await expect(leafLink).toBeVisible();
  await expect(leafLink).toHaveAttribute('aria-current', 'page');
  await expect(leafLink).toBeInViewport();

  // The server HTML holds the whole tree whatever the reader collapsed.
  const html = await (await request.get('/')).text();
  expect(html).toContain(`href="/article/${chapter.slug}"`);
  expect(html).toContain(`href="/article/${leaf.slug}"`);
});
