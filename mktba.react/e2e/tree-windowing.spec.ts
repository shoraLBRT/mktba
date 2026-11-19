import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { API_URL, declineAnalytics, publishArticle, publishArticles } from './helpers';

// The navigation tree is windowed above 300 articles (NAVIGATION_TREE_WINDOWING_THRESHOLD).
const CHILDREN = 320;

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

// Runs last (file order) and deletes what it seeds: every other scenario works with a small tree.
test('a tree of more than 300 articles keeps only the rows in view in the DOM and still follows the reader (R-09)', async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const text = [{ order: 1, opinions: [{ content: 'Текст', isDefault: true, schoolIds: [] }] }];
  const section = await publishArticle(request, `Большой раздел ${stamp}`, text);
  const titles = Array.from({ length: CHILDREN }, (_, index) => `Строка ${stamp} ${String(index + 1).padStart(3, '0')}`);
  const { articles: children, headers } = await publishArticles(request, titles, text, { parentArticleId: section.id });

  try {
    const first = children[0];
    const last = children[CHILDREN - 1];

    // Crawlers and readers without JS: the server HTML holds every link of the tree.
    const html = await (await request.get('/')).text();
    expect(html).toContain(`href="/article/${first.slug}"`);
    expect(html).toContain(`href="/article/${last.slug}"`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const tree = page.getByRole('complementary').getByRole('navigation', { name: 'Статьи' });
    const link = (title: string) => tree.getByRole('link', { name: title, exact: true });
    const sectionLink = link(`Большой раздел ${stamp}`);
    const firstLink = link(titles[0]);
    const lastLink = link(titles[CHILDREN - 1]);

    // After hydration the list is flat and holds a few screens of rows, not the whole tree.
    await expect(tree.locator('ul[data-tree-windowed]')).toBeVisible();
    const rowsInDom = await tree.locator('li[data-tree-item]').count();
    expect(rowsInDom).toBeGreaterThan(10);
    expect(rowsInDom).toBeLessThan(100);
    test.info().annotations.push({ type: 'rows in DOM', description: `${rowsInDom} of more than ${CHILDREN}` });

    const { violations } = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    expect(violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => violation.id)).toEqual([]);

    // Opening the last article scrolls the tree to a row that was not rendered.
    await page.goto(`/article/${last.slug}`);
    await expect(lastLink).toHaveAttribute('aria-current', 'page');
    await expect(lastLink).toBeInViewport();
    await expect(lastLink.locator('xpath=ancestor::li[1]')).toHaveAttribute('aria-level', '2');
    await expect(lastLink.locator('xpath=ancestor::li[1]')).toHaveAttribute('aria-posinset', String(CHILDREN));
    await expect(lastLink.locator('xpath=ancestor::li[1]')).toHaveAttribute('aria-setsize', String(CHILDREN));
    await expect(sectionLink).toHaveCount(0);

    // Left from the last article: focus lands on its section, 320 rows above, rendered on demand.
    await expect(async () => {
      await lastLink.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(sectionLink).toBeFocused({ timeout: 1000 });
    }).toPass();
    await expect(sectionLink).toBeInViewport();

    // Left again collapses the section; the choice survives a reload in windowed mode too.
    await page.keyboard.press('ArrowLeft');
    await expect(firstLink).toHaveCount(0);
    await page.goto('/');
    const sectionRow = sectionLink.locator('..');
    await expect(sectionRow.getByRole('button', { name: 'Развернуть раздел' })).toHaveAttribute('aria-expanded', 'false');
    await expect(sectionRow.getByText(`Подразделов: ${CHILDREN}`)).toBeAttached();
    await expect(firstLink).toHaveCount(0);

    // Right expands and steps in; End jumps to the last row of the tree, wherever it is.
    await sectionLink.focus();
    await page.keyboard.press('ArrowRight');
    await expect(firstLink).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(firstLink).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(link(titles[1])).toBeFocused();
    await page.keyboard.press('End');
    await expect(tree.locator('li[data-tree-item]').last().locator('[data-tree-focus]')).toBeFocused();
    await expect(firstLink).toHaveCount(0);
  } finally {
    for (const article of [...children, section]) {
      await request.delete(`${API_URL}/articles/${article.id}`, { headers });
    }
  }
});
