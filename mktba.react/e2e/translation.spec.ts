import { expect, test } from '@playwright/test';
import { API_URL, declineAnalytics, logIn, publishArticle } from './helpers';

// The translation flow (I-06, #110): an editor translates a published article from the editor's
// «Переводы» block, the translation is published, and the reader's English pages (the tree, the home
// lists) show it under /en/ while the Russian ones do not.

const paragraphs = [{ order: 1, opinions: [{ content: 'Текст оригинала.', isDefault: true, schoolIds: [] }] }];

test('an editor translates an article and the English lists and tree show the translation under /en/', async ({ page, browser, request }) => {
  const stamp = Date.now();
  const russianTitle = `Namaz ${stamp}`;
  const englishTitle = `Prayer ${stamp}`;
  const englishSlug = `prayer-${stamp}`;
  const russian = await publishArticle(request, russianTitle, paragraphs);
  await logIn(page);

  // The editor of the original offers a translation into English; the new translation shows the original.
  await page.goto(`/admin/articles/${russian.id}/edit`);
  const translations = page.getByTestId('translations-panel');
  await translations.getByRole('link', { name: /^Перевести: / }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/articles/new\\?translationOf=${russian.id}&locale=en$`));
  await expect(page.getByTestId('translations-panel')).toContainText('Новый перевод на');
  await expect(page.getByText('Текст оригинала.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Название статьи...' }).fill(englishTitle);
  await page.getByRole('textbox', { name: 'Введите текст параграфа...' }).fill('The translated text.');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/${englishSlug}$`));

  // The saved translation joined the original's group: the API names it among the original's versions.
  const content = await request.get(`${API_URL}/articles/by-slug/${englishSlug}/content?locale=en`, { headers: russian.headers });
  expect(content.ok()).toBe(true);
  const english = await content.json() as { id: number; status: string; translations: { articleId: number }[] };
  expect(english.status).toBe('Draft');
  expect(english.translations.map((version) => version.articleId)).toContain(russian.id);
  for (const status of ['InReview', 'Published']) {
    expect((await request.post(`${API_URL}/articles/${english.id}/status`, { headers: russian.headers, data: { status } })).ok()).toBe(true);
  }

  const reader = await browser.newPage();
  await declineAnalytics(reader);

  // The English home: the tree and the new articles hold the translation, linked under /en/, and
  // not the Russian original.
  await reader.goto('/en/');
  const englishTree = reader.getByRole('complementary');
  await expect(englishTree.getByRole('link', { name: englishTitle, exact: true })).toHaveAttribute('href', `/en/${englishSlug}`);
  await expect(englishTree.getByRole('link', { name: russianTitle, exact: true })).toHaveCount(0);
  await expect(reader.getByRole('main').getByRole('link', { name: englishTitle, exact: true }).first()).toHaveAttribute('href', `/en/${englishSlug}`);
  await expect(reader.locator('meta[name="robots"]')).toHaveCount(0);

  // The Russian home: the original, not the translation (the Russian tree may be windowed, so the
  // original is looked for among the new articles).
  await reader.goto('/');
  await expect(reader.getByRole('main').getByRole('link', { name: russianTitle, exact: true }).first()).toHaveAttribute('href', `/${russian.slug}`);
  await expect(reader.getByRole('link', { name: englishTitle, exact: true })).toHaveCount(0);

  // From the English tree to the translation, and through the switcher to the original.
  await reader.goto('/en/');
  await reader.getByRole('complementary').getByRole('link', { name: englishTitle, exact: true }).click();
  await expect(reader).toHaveURL(new RegExp(`/en/${englishSlug}$`));
  await expect(reader.getByRole('heading', { name: englishTitle, level: 1 })).toBeVisible();
  await expect(reader.getByText('The translated text.')).toBeVisible();
  await reader.getByTestId('language-switcher').getByRole('link', { name: 'Русский' }).click();
  await expect(reader).toHaveURL(new RegExp(`/${russian.slug}$`));
  await expect(reader.getByRole('heading', { name: russianTitle, level: 1 })).toBeVisible();
  await reader.close();

  for (const id of [english.id, russian.id]) {
    expect((await request.delete(`${API_URL}/articles/${id}`, { headers: russian.headers })).ok()).toBe(true);
  }
});
