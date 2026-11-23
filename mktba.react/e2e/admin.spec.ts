import { expect, test } from '@playwright/test';
import { declineAnalytics, logIn, openAdminArticleTree, publishArticle } from './helpers';

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

test('blocks are reordered by dragging their handle and a heading is made from the / menu', async ({ page }) => {
  const title = `E2E блоки ${Date.now()}`;
  const paragraphs = page.getByRole('textbox', { name: 'Введите текст параграфа...' });
  await logIn(page);
  await page.goto('/admin/articles/new');
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  await paragraphs.first().fill('Первый абзац.');
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await paragraphs.nth(1).fill('Второй абзац.');

  // The second block is dropped on the upper half of the first one.
  await page.getByRole('button', { name: /^Блок 2 из 2\./ }).dragTo(page.getByRole('button', { name: /^Блок 1 из 2\./ }));
  await expect(paragraphs.first()).toHaveText('Второй абзац.');
  await expect(paragraphs.nth(1)).toHaveText('Первый абзац.');

  // An empty paragraph typed `/h2` into becomes a heading on Enter (a new block goes after the focused one).
  await paragraphs.nth(1).click();
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await paragraphs.nth(2).click();
  await page.keyboard.type('/h2');
  await expect(page.getByRole('listbox', { name: 'Тип блока' }).getByRole('option')).toHaveText([/Заголовок H2/]);
  await page.keyboard.press('Enter');
  const heading = page.getByPlaceholder('Заголовок раздела...');
  await expect(heading).toBeFocused();
  await heading.fill('Раздел в конце');

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text.indexOf('Второй абзац.')).toBeLessThan(text.indexOf('Первый абзац.'));
  await expect(page.getByRole('heading', { name: 'Раздел в конце', level: 2 })).toBeVisible();
});

test('leaving the editor with unsaved edits asks first, and a saved draft leaves freely', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E правки ${stamp}`;
  const titleField = page.getByRole('textbox', { name: 'Название статьи...' });
  const leaveDialog = page.getByRole('alertdialog', { name: 'Уйти без сохранения?' });
  // The history page is opened from the editor's history dialog.
  const openHistoryPage = async () => {
    await page.getByRole('button', { name: 'История правок' }).click();
    await page.getByRole('dialog', { name: 'История правок' }).getByRole('link', { name: 'Открыть отдельной страницей' }).click();
  };
  await logIn(page);

  // Saving a new article goes to it without asking.
  await page.goto('/admin/articles/new');
  await titleField.fill(title);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('Текст.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  // An untouched editor is left without asking.
  await (await openAdminArticleTree(page)).getByRole('link', { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/edit$/);
  const editUrl = page.url();
  await openHistoryPage();
  await expect(page).toHaveURL(/\/history$/);

  await page.goto(editUrl);
  await titleField.fill(`${title} (не сохранено)`);
  await openHistoryPage();
  await expect(leaveDialog).toBeVisible();
  await expect(leaveDialog.getByRole('button', { name: 'Остаться' })).toBeFocused();
  await leaveDialog.getByRole('button', { name: 'Остаться' }).click();
  await expect(leaveDialog).toBeHidden();
  await expect(page).toHaveURL(editUrl);
  await expect(titleField).toHaveValue(`${title} (не сохранено)`);

  await openHistoryPage();
  await leaveDialog.getByRole('button', { name: 'Уйти без сохранения' }).click();
  await expect(page).toHaveURL(/\/history$/);

  // Closing the tab with unsaved edits asks the browser's own question.
  await page.goto(editUrl);
  await titleField.fill(`${title} (снова)`);
  const unload = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await unload;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.accept();
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

  // The editor's history: the last save compared with the one before, then rolled back in place.
  await page.goto(editUrl);
  await page.getByRole('button', { name: 'История правок' }).click();
  const history = page.getByRole('dialog', { name: 'История правок' });
  await expect(history.getByText('Неудачная правка')).toBeVisible();
  const paragraph = history.getByRole('region', { name: 'Абзац 1' });
  await expect(paragraph.locator('[data-diff="removed"]')).toContainText('Исходный текст.');
  await expect(paragraph.locator('[data-diff="added"]')).toContainText('Испорченный текст.');

  const first = history.getByRole('listitem', { name: 'Ревизия 1' });
  await first.getByRole('button', { name: 'Откатить к этой ревизии' }).click();
  await first.getByRole('button', { name: 'Подтвердить откат' }).click();
  await expect(page.getByText('Статья откачена к ревизии 1; сохранена как ревизия 3')).toBeVisible();
  await expect(history).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Введите текст параграфа...' })).toHaveText('Исходный текст.');

  // The page of its own lists the rollback as the newest revision.
  await page.getByRole('button', { name: 'История правок' }).click();
  await history.getByRole('link', { name: 'Открыть отдельной страницей' }).click();
  await expect(page).toHaveURL(/\/admin\/articles\/\d+\/history$/);
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
  await expect(row(first)).toHaveAttribute('style', /padding-inline-start: 6px/);
});

test('an admin drags sections in the tree and renames one, and the server keeps both', async ({ page }) => {
  const stamp = Date.now();
  const parent = `E2E перетаскивание ${stamp}`;
  const first = `E2E альфа ${stamp}`;
  const second = `E2E бета ${stamp}`;
  const renamed = `E2E гамма ${stamp}`;
  await logIn(page);
  const sidebar = await openAdminArticleTree(page);
  const row = (title: string) => sidebar.getByRole('link', { name: title, exact: true }).locator('..');
  const childTitles = row(parent).locator('xpath=following-sibling::ul[1]').getByRole('link');
  const create = async (title: string, under?: string) => {
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

  await create(parent);
  await create(first);
  await create(second, parent);

  // The middle of a row takes the dragged one as its last child.
  await row(first).hover();
  await row(first).getByTestId('tree-drag-handle').dragTo(row(parent));
  await expect(childTitles).toHaveText([second, first]);

  // The upper quarter of a row puts the dragged one before it.
  await row(first).hover();
  await row(first).getByTestId('tree-drag-handle').dragTo(row(second), { targetPosition: { x: 40, y: 1 } });
  await expect(childTitles).toHaveText([first, second]);

  await row(second).hover();
  await row(second).getByRole('button', { name: 'Переименовать' }).click();
  const dialog = page.getByRole('dialog', { name: 'Переименование' });
  await dialog.getByLabel('Название раздела').fill(renamed);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(childTitles).toHaveText([first, renamed]);
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

test('an admin links another article from the editor, a broken link only warns, and readers follow the link in the tab', async ({ page, request }) => {
  const stamp = Date.now();
  const target = await publishArticle(request, `E2E цель ссылки ${stamp}`, [
    { order: 1, opinions: [{ content: 'Статья, на которую ссылаются.', isDefault: true, schoolIds: [] }] },
  ]);
  const missingSlug = `e2e-net-takoy-${stamp}`;
  const title = `E2E статья со ссылкой ${stamp}`;
  await logIn(page);

  await page.goto('/admin/articles/new');
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  const text = page.getByRole('textbox', { name: 'Введите текст параграфа...' });
  await text.fill('Подробнее: ');
  await page.getByRole('button', { name: 'Ссылка на статью' }).click();
  const picker = page.getByRole('dialog', { name: 'Ссылка на статью' });
  await picker.getByRole('searchbox', { name: 'Поиск статьи' }).fill(`цель ссылки ${stamp}`);
  await picker.getByRole('button', { name: new RegExp(`E2E цель ссылки ${stamp}`) }).click();
  await expect(picker).toBeHidden();
  await expect(text).toHaveText(`Подробнее: E2E цель ссылки ${stamp}`);
  await expect(text.getByRole('link', { name: `E2E цель ссылки ${stamp}` })).toHaveAttribute('href', `/${target.slug}`);

  // Markdown typed into the rich text becomes a link as the closing parenthesis is typed.
  await text.press('Control+End');
  await text.pressSequentially(` и [нет](/${missingSlug})`);
  await expect(text).toHaveText(`Подробнее: E2E цель ссылки ${stamp} и нет`);
  await expect(text.getByRole('link', { name: 'нет', exact: true })).toHaveAttribute('href', `/${missingSlug}`);
  const warnings = page.getByRole('region', { name: 'Проверьте ссылки на статьи' });
  await expect(warnings).toContainText(`/${missingSlug} — такой статьи нет`);
  await expect(warnings).not.toContainText(`/${target.slug}`);

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  const link = page.getByText('Подробнее:').getByRole('link', { name: `E2E цель ссылки ${stamp}` });
  await expect(link).not.toHaveAttribute('target');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${target.slug}$`));
  await expect(page.getByText('Статья, на которую ссылаются.')).toBeVisible();
});

test('an author uploads an image into the text and readers see it from the uploads address', async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E картинка ${stamp}`;
  const slug = `e2e-kartinka-${stamp}`;
  // A 1×1 PNG: the server re-encodes it as WebP.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await logIn(page);

  await page.goto('/admin/articles/new');
  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(title);
  const paragraph = page.getByRole('textbox', { name: 'Введите текст параграфа...' });
  await paragraph.fill('Текст до картинки. ');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Картинка', exact: true }).click();
  await (await chooser).setFiles({ name: 'kaaba.png', mimeType: 'image/png', buffer: png });

  const dialog = page.getByRole('dialog', { name: 'Картинка' });
  await expect(dialog.getByRole('status')).toHaveText('Загружено, 1 × 1 px');
  await dialog.getByRole('textbox', { name: 'Описание картинки' }).fill('Кааба');
  await dialog.getByRole('button', { name: 'Вставить' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(paragraph).toContainText(/!\[Кааба\]\(http[^)]+\/files\/[0-9a-f]{32}\.webp\)/);

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^[^/]+//[^/]+/${slug}$`));

  const image = page.getByRole('img', { name: 'Кааба' });
  await expect(image).toHaveAttribute('loading', 'lazy');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => {
    // The e2e project has no DOM types; this runs in the page.
    const loaded = element as unknown as { complete: boolean; naturalWidth: number };
    return loaded.complete && loaded.naturalWidth;
  })).toBe(1);
});
