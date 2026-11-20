import { expect, test } from '@playwright/test';
import { declineAnalytics, logIn, openAdminArticleTree } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

test('an admin logs in and reaches the admin panel', async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole('button', { name: 'Добавить статью' })).toBeVisible();
});

test('a reload keeps the admin signed in without a token in storage', async ({ page }) => {
  await logIn(page);

  await page.reload();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible();
  const storedKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storedKeys).not.toContain('mktba.admin.token');
  const cookies = await page.context().cookies('http://localhost:5172/auth/refresh');
  expect(cookies.find((cookie) => cookie.name === 'mktba_refresh')?.httpOnly).toBe(true);
});

test('logging out ends the session, so a reload does not sign back in', async ({ page }) => {
  await logIn(page);

  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('an admin creates an article and then edits it', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E статья ${stamp}`;
  const editedTitle = `${title} (правка)`;
  const slug = `e2e-statya-${stamp}`;
  const editedSlug = `e2e-adres-${stamp}`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/new$/);
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await expect(page.getByRole('textbox', { name: 'Адрес статьи' })).toHaveValue(slug);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Первый абзац из E2E-теста.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${slug}$`));
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Первый абзац из E2E-теста.')).toBeVisible();
  const articleUrl = page.url();

  // The admin article tree links straight to the editor.
  await (await openAdminArticleTree(page)).getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/edit$/);
  const articleId = page.url().match(/\/admin\/articles\/(\d+)\/edit$/)![1];
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(editedTitle);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

  // A new title keeps the slug, so links to the article do not change.
  await expect(page).toHaveURL(articleUrl);
  await expect(page.getByRole('heading', { name: editedTitle, level: 1 })).toBeVisible();

  await page.goto(`/admin/articles/${articleId}/edit`);
  await page.getByRole('textbox', { name: 'Адрес статьи' }).fill(editedSlug);
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${editedSlug}$`));

  // The old slug and the pre-slug numeric link both land on the current slug.
  await page.goto(articleUrl);
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${editedSlug}$`));
  await expect(page.getByRole('heading', { name: editedTitle, level: 1 })).toBeVisible();
  await page.goto(`/article/${articleId}`);
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${editedSlug}$`));
});

test('an admin finds a draft in the article table and submits it for review in bulk', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E таблица ${stamp}`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Абзац для таблицы статей.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await page.goto('/admin/articles');
  await page.getByLabel('Поиск').fill(String(stamp));
  await page.getByLabel('Статус').selectOption('Draft');
  await expect(page).toHaveURL(new RegExp(`search=${stamp}`));
  await expect(page).toHaveURL(/status=Draft/);
  const table = page.getByRole('table', { name: 'Список статей' });
  const row = table.getByRole('row').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('Черновик')).toBeVisible();

  await row.getByRole('checkbox').check();
  await page.getByRole('region', { name: 'Действия с выбранными' }).getByRole('button', { name: 'Отправить на проверку' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('status')).toContainText('Статус изменён: 1 из 1.');

  // The draft filter no longer matches; the same search under InReview does.
  await expect(page.getByText('Статей с такими условиями нет.')).toBeVisible();
  await page.getByLabel('Статус').selectOption('InReview');
  await expect(table.getByRole('row').filter({ hasText: title }).getByText('На проверке')).toBeVisible();
});

test('without a configured AI provider the editor explains where to set it up', async ({ page }) => {
  await logIn(page);
  await page.getByRole('button', { name: 'Добавить статью' }).click();

  await expect(page.getByRole('button', { name: 'Улучшить с ИИ' })).toBeDisabled();
  await expect(page.getByText(/ИИ не настроен/)).toBeVisible();
  await page.getByRole('link', { name: 'Открыть настройки ИИ' }).click();

  await expect(page).toHaveURL(/\/admin\/ai$/);
  const baseUrl = page.locator('input[name="ai-base-url"]');
  await expect(baseUrl).toHaveValue('');
  await expect(baseUrl).toHaveAttribute('placeholder', 'https://api.openai.com/v1');
});

test('a new article is a draft hidden from readers until it is published', async ({ page, browser }) => {
  const stamp = Date.now();
  const title = `E2E черновик ${stamp}`;
  const slug = `e2e-chernovik-${stamp}`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Текст черновика.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${slug}$`));

  const reader = await browser.newPage();
  await declineAnalytics(reader);
  await reader.goto(`/${slug}`);
  await expect(reader.getByText('Страница не найдена')).toBeVisible();
  await expect(reader.getByText('Текст черновика.')).toHaveCount(0);
  await expect(reader.getByRole('complementary').getByRole('link', { name: title, exact: true })).toHaveCount(0);

  await (await openAdminArticleTree(page)).getByRole('link', { name: title, exact: true }).click();
  const statusPanel = page.getByTestId('article-status-panel');
  await expect(statusPanel.getByText('Черновик')).toBeVisible();
  await statusPanel.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(statusPanel.getByText('На проверке')).toBeVisible();
  await statusPanel.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(statusPanel.getByText('Опубликована')).toBeVisible();
  await expect(page.getByTestId('article-authors-panel').getByLabel('Автор', { exact: true })).not.toHaveValue('');

  await reader.goto(`/${slug}`);
  await expect(reader.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(reader.getByText('Текст черновика.')).toBeVisible();
  await expect(reader.getByTestId('article-dates')).toContainText('Опубликовано');
  await reader.close();
});

test('an edit is kept in the history, can be compared and rolled back', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E история ${stamp}`;
  await logIn(page);

  await page.goto('/admin/articles/new');
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Исходный текст.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await (await openAdminArticleTree(page)).getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/edit$/);
  const editUrl = page.url();
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Испорченный текст.');
  await page.getByRole('textbox', { name: 'Комментарий к правке' }).fill('Неудачная правка');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Испорченный текст.')).toBeVisible();

  await page.goto(editUrl);
  await page.getByRole('link', { name: 'История правок' }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/history$/);
  await expect(page.getByText('Неудачная правка')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сравнение ревизий 1 и 2' })).toBeVisible();
  const paragraph = page.getByRole('region', { name: 'Абзац 1' });
  await expect(paragraph.locator('[data-diff="removed"]')).toContainText('Исходный текст.');
  await expect(paragraph.locator('[data-diff="added"]')).toContainText('Испорченный текст.');

  const first = page.getByRole('listitem').filter({ hasText: 'Ревизия 1' });
  await first.getByRole('button', { name: 'Откатить к этой ревизии' }).click();
  await first.getByRole('button', { name: 'Подтвердить откат' }).click();
  await expect(page.getByRole('status')).toContainText('сохранена как ревизия 3');
  await expect(page.getByText('Откат к ревизии 1')).toBeVisible();

  await page.goto(editUrl.replace(/\/edit$/, '').replace('/admin/articles/', '/article/'));
  await expect(page.getByText('Исходный текст.')).toBeVisible();
});

test('an admin reorders sections and moves one under another parent', async ({ page }) => {
  const stamp = Date.now();
  const parent = `E2E раздел ${stamp}`;
  const first = `E2E первая ${stamp}`;
  const second = `E2E вторая ${stamp}`;
  await logIn(page);
  const sidebar = await openAdminArticleTree(page);
  const row = (title: string) => sidebar.getByRole('link', { name: title, exact: true }).locator('..');
  const createSection = async (title: string, under?: string) => {
    if (under) {
      await row(under).hover();
      await row(under).getByRole('button', { name: 'Добавить подраздел' }).click();
    } else {
      await sidebar.getByRole('button', { name: 'Новый раздел' }).click();
    }
    await page.getByPlaceholder('Название раздела').fill(title);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(row(title)).toBeVisible();
  };

  await createSection(parent);
  await createSection(first, parent);
  await createSection(second, parent);
  const childTitles = row(parent).locator('xpath=following-sibling::ul[1]').getByRole('link');
  await expect(childTitles).toHaveText([first, second]);

  await row(second).hover();
  await row(second).getByRole('button', { name: 'Переместить выше' }).click();
  await expect(childTitles).toHaveText([second, first]);

  // After a reload the order comes from the server.
  await page.reload();
  await expect(childTitles).toHaveText([second, first]);

  await row(first).hover();
  await row(first).getByRole('button', { name: 'Переместить в другой раздел' }).click();
  const parentSelect = page.getByLabel('Новый родительский раздел');
  // The picker offers neither the article itself nor anything inside it.
  await expect(parentSelect.locator('option', { hasText: first })).toHaveCount(0);
  await parentSelect.selectOption({ label: 'Верхний уровень' });
  await page.getByRole('button', { name: 'Переместить', exact: true }).click();
  await expect(childTitles).toHaveText([second]);
  // A top-level row has no depth indent.
  await expect(row(first)).toHaveAttribute('style', /padding-left: 6px/);
});

test('an admin cites a new source in the editor, and readers see it under the published article', async ({ page, browser, request }) => {
  const stamp = Date.now();
  const title = `E2E источники ${stamp}`;
  const slug = `e2e-istochniki-${stamp}`;
  const sourceTitle = `Сахих ${stamp}`;
  await logIn(page);

  await page.getByRole('button', { name: 'Добавить статью' }).click();
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Абзац со ссылкой на хадис.');
  await page.getByRole('button', { name: 'Источник', exact: true }).click();
  await page.getByRole('button', { name: 'Новый источник' }).click();
  const form = page.getByTestId('source-create-form');
  await form.getByLabel('Вид источника').selectOption('HadithCollection');
  await form.getByLabel('Название').fill(sourceTitle);
  await form.getByLabel('Автор').fill('аль-Бухари');
  await form.getByRole('button', { name: 'Добавить в справочник' }).click();
  await page.getByLabel(`Место в источнике «${sourceTitle}»`).fill('№ 1');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${slug}$`));

  // The editor opens the saved article with the citation and its locator, and publishes it.
  await (await openAdminArticleTree(page)).getByRole('link', { name: title, exact: true }).click();
  await expect(page.getByLabel(`Место в источнике «${sourceTitle}»`)).toHaveValue('№ 1');
  const statusPanel = page.getByTestId('article-status-panel');
  await statusPanel.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(statusPanel.getByText('На проверке')).toBeVisible();
  await statusPanel.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(statusPanel.getByText('Опубликована')).toBeVisible();

  // The directory now offers the source to the next opinion that needs it.
  await page.getByRole('button', { name: 'Источник', exact: true }).click();
  await page.getByLabel('Поиск в справочнике источников').fill(String(stamp));
  // Until the search answers, the picker keeps showing the previous results (keepPreviousData).
  const found = page.getByRole('list', { name: 'Найденные источники' }).getByRole('button');
  await expect(found).toHaveCount(1);
  await expect(found).toContainText(`аль-Бухари. ${sourceTitle}`);

  // The server HTML already holds the block: it does not wait for the browser.
  const html = await (await request.get(`/${slug}`)).text();
  expect(html).toContain('id="article-sources-title"');
  expect(html).toContain(sourceTitle);

  const reader = await browser.newPage();
  await declineAnalytics(reader);
  await reader.goto(`/${slug}`);
  const sources = reader.getByTestId('article-sources');
  await expect(sources.getByRole('heading', { name: 'Источники', level: 2 })).toBeVisible();
  await expect(sources.getByRole('listitem')).toHaveText(`аль-Бухари. ${sourceTitle} — № 1`);
  await sources.getByRole('link', { name: '№ 1' }).click();
  await expect(reader).toHaveURL(/#p-\d+$/);
  await expect(reader.getByText('Абзац со ссылкой на хадис.')).toBeInViewport();
  await reader.close();
});
