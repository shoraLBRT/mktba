import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { ArticleRightSidebar, type TocItem } from './ArticleRightSidebar';

const { trackGoal } = vi.hoisted(() => ({ trackGoal: vi.fn() }));
vi.mock('../../analytics/metrika', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/metrika')>()),
  trackGoal,
}));

const tocItems: TocItem[] = [
  { id: 'article-overview', label: 'Общее описание', depth: 2 },
  { id: 'usloviya', label: 'Условия', depth: 2 },
  { id: 'niyat', label: 'Ният', depth: 3 },
];

/** Puts the page's sections at the given distances from the viewport's top. */
const placeSections = (tops: Record<string, number>) => {
  Object.entries(tops).forEach(([id, top]) => {
    let section = document.getElementById(id);
    if (!section) {
      section = document.createElement('div');
      section.id = id;
      document.body.appendChild(section);
    }
    section.getBoundingClientRect = () => ({ top }) as DOMRect;
  });
};

const renderSidebar = () =>
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ArticleRightSidebar tocItems={tocItems} />
      </LocalizationProvider>
    </MemoryRouter>,
  );

const tocLinks = () =>
  within(screen.getByRole('navigation', { name: 'На этой странице' })).getAllByRole('link');
const currentEntries = () =>
  tocLinks()
    .filter((link) => link.getAttribute('aria-current') === 'location')
    .map((link) => link.textContent);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  trackGoal.mockClear();
  tocItems.forEach((item) => document.getElementById(item.id)?.remove());
});

describe('ArticleRightSidebar table of contents', () => {
  it('given sections and subsections, when rendered, then each entry links to its anchor', () => {
    placeSections({ 'article-overview': 0, usloviya: 600, niyat: 1200 });
    renderSidebar();

    expect(tocLinks().map((link) => link.getAttribute('href'))).toEqual([
      '#article-overview',
      '#usloviya',
      '#niyat',
    ]);
  });

  it('given the top of the page, when rendered, then the first entry is the current one', () => {
    placeSections({ 'article-overview': 0, usloviya: 600, niyat: 1200 });
    renderSidebar();

    expect(currentEntries()).toEqual(['Общее описание']);
  });

  it('given the reader scrolls into a later section, when the page scrolls, then that entry is the only current one', () => {
    placeSections({ 'article-overview': 0, usloviya: 600, niyat: 1200 });
    renderSidebar();

    placeSections({ 'article-overview': -1100, usloviya: -500, niyat: 100 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(currentEntries()).toEqual(['Ният']);
  });

  it('given an entry, when clicked, then reports the toc_click goal with its depth', () => {
    placeSections({ 'article-overview': 0, usloviya: 600, niyat: 1200 });
    renderSidebar();

    fireEvent.click(screen.getByRole('link', { name: 'Ният' }));

    expect(trackGoal).toHaveBeenCalledExactlyOnceWith('toc_click', { depth: 3 });
  });
});
