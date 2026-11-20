import { expect, test } from '@playwright/test';
import { API_URL, declineAnalytics, logIn, publishArticle } from './helpers';

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

test('the editor previews the draft as a reader, with its own mazhab and a phone width (E-11)', async ({ page, request }, testInfo) => {
  const schools = await (await request.get(`${API_URL}/schools/system`)).json() as { id: number; slug: string }[];
  const schoolId = (slug: string) => schools.find((school) => school.slug === slug)!.id;
  const title = `Предпросмотр ${Date.now()}`;
  const article = await publishArticle(request, title, [
    { order: 1, opinions: [{ content: 'Общий текст статьи для всех.', isDefault: true, schoolIds: [] }] },
    {
      order: 2,
      opinions: [
        { content: 'Мнение ханафитов в предпросмотре.', isDefault: true, schoolIds: [schoolId('hanafi')] },
        { content: 'Мнение шафиитов в предпросмотре.', isDefault: false, schoolIds: [schoolId('shafii')] },
      ],
    },
  ]);

  // A common laptop-and-up screen: the desktop frame (1280) fits at full size.
  await page.setViewportSize({ width: 1440, height: 900 });
  await logIn(page);
  // The reader's own saved mazhab, which the preview's switch must leave alone.
  const saved = String(schoolId('hanafi'));
  await page.evaluate((id) => localStorage.setItem('mktba.mazhab', id), saved);

  await page.goto(`/admin/articles/${article.id}/edit`);
  const previewButton = page.getByRole('button', { name: 'Просмотр' });
  await previewButton.click();

  // A dialog over the whole window, the editor behind it inert.
  const dialog = page.getByRole('dialog', { name: 'Предпросмотр как у читателя' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Закрыть предпросмотр' })).toBeFocused();
  const frameElement = page.getByTestId('article-preview-frame');
  await expect(frameElement).toBeVisible();
  await expect(frameElement).toHaveAttribute('data-scale', '1');
  const frameWindow = (await (await frameElement.elementHandle())!.contentFrame())!;
  await expect.poll(() => frameWindow.evaluate('window.innerWidth')).toBe(1280);
  const frame = page.frameLocator('[data-testid="article-preview-frame"]');
  const heading = frame.getByRole('heading', { level: 1, name: title });
  await expect(heading).toBeVisible();
  await expect(frame.getByText('Общий текст статьи для всех.')).toBeVisible();

  // The app's stylesheets reached the frame: the h1 has the article's 28px size and bold weight,
  // not the browser's default 32px, and the page font is not the default serif.
  await expect(heading).toHaveCSS('font-size', '28px');
  await expect(heading).toHaveCSS('font-weight', '700');
  await expect(heading).not.toHaveCSS('font-family', /^"?Times/);

  await expect(frame.getByText('Мнение ханафитов в предпросмотре.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('preview-desktop.png') });

  await dialog.getByRole('combobox').selectOption(String(schoolId('shafii')));
  await expect(frame.getByText('Мнение шафиитов в предпросмотре.')).toBeVisible();
  await expect(frame.getByText('Мнение ханафитов в предпросмотре.')).toBeHidden();

  await dialog.getByRole('button', { name: 'Телефон · 375 px' }).click();
  await expect.poll(() => frameWindow.evaluate('window.innerWidth')).toBe(375);
  await expect(frame.getByText('Мнение шафиитов в предпросмотре.')).toBeVisible();

  // Escape closes it, from the dialog's own controls, and the focus is back on «Просмотр».
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(frameElement).toHaveCount(0);
  await expect(previewButton).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('mktba.mazhab'))).toBe(saved);
});
