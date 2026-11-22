import { expect, test, type Locator, type Page } from '@playwright/test';
import { declineAnalytics } from './helpers';

// RTL readiness (I-09, #113): the layout is written in logical CSS, so a right-to-left language
// needs only `dir="rtl"` on <html>. There is no RTL language yet, so the test sets `dir` itself.

test.beforeEach(async ({ page }) => {
  await declineAnalytics(page);
});

// The e2e project has no DOM types, so the page-side code is a string; it runs in the page.
const setDirection = (page: Page, dir: 'ltr' | 'rtl') => page.evaluate(`document.documentElement.dir = '${dir}'`);

const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
};

/** The CSS `scale` of an element: Tailwind's `rtl:-scale-x-100` mirrors an icon with it. */
const scaleOf = (locator: Locator) => locator.evaluate<string>('(element) => getComputedStyle(element).scale');

test('the page declares its writing direction from the language of the URL', async ({ page }) => {
  await page.goto('/salat');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.goto('/en/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('under dir="rtl" the sidebar moves to the right and the breadcrumb chevrons point left', async ({ page }) => {
  await page.goto('/salat');
  await expect(page.getByRole('heading', { name: 'Салат', level: 1 })).toBeVisible();

  const sidebar = page.locator('aside').filter({ has: page.getByRole('navigation') }).first();
  const main = page.locator('main');
  const chevron = page.getByTestId('article-breadcrumbs').locator('svg').first();
  const viewportWidth = page.viewportSize()!.width;

  // Left to right: the sidebar is at the left edge, before the content; chevrons are as drawn.
  const ltrSidebar = await box(sidebar);
  expect(ltrSidebar.x).toBeLessThan(1);
  expect(ltrSidebar.x + ltrSidebar.width).toBeLessThanOrEqual((await box(main)).x + 1);
  expect(await scaleOf(chevron)).toBe('none');

  await setDirection(page, 'rtl');

  // Right to left: the same markup mirrors — the sidebar sits at the right edge, after the content.
  await expect.poll(async () => (await box(sidebar)).x + (await box(sidebar)).width).toBeGreaterThan(viewportWidth - 2);
  const rtlSidebar = await box(sidebar);
  const rtlMain = await box(main);
  expect(rtlMain.x + rtlMain.width).toBeLessThanOrEqual(rtlSidebar.x + 1);
  expect(await scaleOf(chevron)).toBe('-1 1');
});
