import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, resetNavigationTreeStateForTests } from '../shared/navigationTreeState';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';
import NavigationTree from './NavigationTree';
import {
  hasMoreArticlesThan,
  NAVIGATION_TREE_WINDOWING_THRESHOLD,
  rowRangeInView,
  WINDOW_OVERSCAN_ROWS,
  WINDOWED_ROW_HEIGHT,
} from './navigationTree/windowing';

const node = (id: number, title: string, children: NavigationArticleDto[] = []) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent: true, canEdit: true, children }) as unknown as NavigationArticleDto;

const SECTIONS = 20;
const CHILDREN = 150;
const sectionId = (section: number) => (section + 1) * 1000;
const childId = (section: number, child: number) => sectionId(section) + child + 1;

/** 20 sections of 150 articles each: 3020 rows when everything is expanded. */
const largeTree = Array.from({ length: SECTIONS }, (_, section) =>
  node(
    sectionId(section),
    `Раздел ${section}`,
    Array.from({ length: CHILDREN }, (_, child) => node(childId(section, child), `Статья ${section}-${child}`)),
  ),
);
const TOTAL_ROWS = SECTIONS * (CHILDREN + 1);

const flatTree = (count: number) => Array.from({ length: count }, (_, index) => node(index + 1, `Статья ${index + 1}`));

const VIEW_HEIGHT = 580;
/** What a 580px-high scroller may hold: the rows in view, the overscan on both sides, two pinned rows. */
const MAX_ROWS_IN_DOM = Math.ceil(VIEW_HEIGHT / WINDOWED_ROW_HEIGHT) + 2 * WINDOW_OVERSCAN_ROWS + 2;

const renderTree = (
  tree: NavigationArticleDto[],
  path = '/',
  props: Partial<React.ComponentProps<typeof NavigationTree>> = {},
) =>
  render(
    <LocalizationProvider>
      <MemoryRouter initialEntries={[path]}>
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
          <NavigationTree navigationTree={tree} {...props} />
        </div>
      </MemoryRouter>
    </LocalizationProvider>,
  );

const scroller = () => screen.getByTestId('scroller');
const list = () => scroller().querySelector('ul') as HTMLUListElement;
const rowsInDom = () => list().querySelectorAll('li[data-tree-item]');
const link = (title: string) => screen.getByRole('link', { name: title });
const queryLink = (title: string) => screen.queryByRole('link', { name: title });
const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

const scrollTo = (top: number) => {
  scroller().scrollTop = top;
  fireEvent.scroll(scroller());
};

const saveCollapsed = (ids: number[]) => {
  localStorage.setItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify(ids));
  resetNavigationTreeStateForTests();
};

const savedCollapsed = () => JSON.parse(localStorage.getItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY) ?? '[]') as number[];

beforeEach(() => {
  localStorage.clear();
  resetNavigationTreeStateForTests();
  // jsdom lays nothing out: give the scroller a height and let the list move with its scrollTop.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
    if (this.matches('[data-testid="scroller"]')) return rect(0, VIEW_HEIGHT);
    if (this.matches('ul[data-tree-windowed]')) return rect(-(this.parentElement?.scrollTop ?? 0), 0);
    return rect(0, 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NavigationTree windowing threshold', () => {
  it('given a tree at the threshold, when rendered, then it stays a nested list with every link', () => {
    renderTree(flatTree(NAVIGATION_TREE_WINDOWING_THRESHOLD));

    expect(list().hasAttribute('data-tree-windowed')).toBe(false);
    expect(rowsInDom()).toHaveLength(NAVIGATION_TREE_WINDOWING_THRESHOLD);
  });

  it('given a tree one article above the threshold, when rendered, then only a bounded number of rows is in the DOM', () => {
    renderTree(flatTree(NAVIGATION_TREE_WINDOWING_THRESHOLD + 1));

    expect(list().hasAttribute('data-tree-windowed')).toBe(true);
    expect(rowsInDom().length).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
  });

  it('given nested sections, when counting against a limit, then every level is counted', () => {
    const tree = [node(1, 'a', [node(2, 'b', [node(3, 'c')])]), node(4, 'd')];

    expect(hasMoreArticlesThan(tree, 3)).toBe(true);
    expect(hasMoreArticlesThan(tree, 4)).toBe(false);
    expect(hasMoreArticlesThan(undefined, 0)).toBe(false);
  });
});

describe('rowRangeInView', () => {
  it('given a list at the top of the visible area, when asked, then it covers the area plus the overscan', () => {
    expect(rowRangeInView(0, 290, 1000)).toEqual({ start: 0, end: 10 + WINDOW_OVERSCAN_ROWS });
  });

  it('given a list scrolled by 100 rows, when asked, then the range moves with it', () => {
    expect(rowRangeInView(-100 * WINDOWED_ROW_HEIGHT, 290, 1000)).toEqual({
      start: 100 - WINDOW_OVERSCAN_ROWS,
      end: 110 + WINDOW_OVERSCAN_ROWS,
    });
  });

  it('given a list wholly below or above the visible area, when asked, then the range is empty and inside the list', () => {
    expect(rowRangeInView(5000, 290, 1000)).toEqual({ start: 0, end: 0 });
    expect(rowRangeInView(-1_000_000, 290, 1000)).toEqual({ start: 1000, end: 1000 });
  });

  it('given a hidden list with no height to show through, when asked, then only the overscan rows remain', () => {
    expect(rowRangeInView(0, 0, 1000)).toEqual({ start: 0, end: WINDOW_OVERSCAN_ROWS });
  });
});

describe('NavigationTree in windowed mode', () => {
  it('given 3020 rows, when rendered, then the list is as high as all of them and holds only the first screens', () => {
    renderTree(largeTree);

    expect(list().style.height).toBe(`${TOTAL_ROWS * WINDOWED_ROW_HEIGHT}px`);
    expect(rowsInDom().length).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
    expect(queryLink('Раздел 0')).not.toBeNull();
    expect(queryLink('Статья 19-149')).toBeNull();
  });

  it('given a scroll far down, when the scroller moves, then the rows there replace the first ones', () => {
    renderTree(largeTree);

    scrollTo(1000 * WINDOWED_ROW_HEIGHT);

    // Row 1000 is the 94th article of the 7th section: 6 * 151 rows come before that section.
    const row = link('Статья 6-93').closest('li') as HTMLElement;
    expect(row.style.top).toBe(`${1000 * WINDOWED_ROW_HEIGHT}px`);
    expect(queryLink('Раздел 0')).toBeNull();
    expect(rowsInDom().length).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
  });

  it('given a flat list, when a row is rendered, then it says its level, its place and the size of its set', () => {
    renderTree(largeTree);

    const section = link('Раздел 0').closest('li') as HTMLElement;
    const article = link('Статья 0-2').closest('li') as HTMLElement;
    expect([section.getAttribute('aria-level'), section.getAttribute('aria-posinset'), section.getAttribute('aria-setsize')]).toEqual(['1', '1', '20']);
    expect([article.getAttribute('aria-level'), article.getAttribute('aria-posinset'), article.getAttribute('aria-setsize')]).toEqual(['2', '3', '150']);
    expect(within(section).getByText('Подразделов: 150')).toBeTruthy();
  });

  it('given a tree above the threshold, when rendered on the server, then the HTML holds every link and hydrates without a mismatch', async () => {
    // 400 rows keep the server render and the hydration of a nested tree well inside the test timeout.
    const rowCount = NAVIGATION_TREE_WINDOWING_THRESHOLD + 100;
    const tree = flatTree(rowCount);
    const app = (
      <LocalizationProvider>
        <MemoryRouter>
          <NavigationTree navigationTree={tree} />
        </MemoryRouter>
      </LocalizationProvider>
    );
    const html = renderToString(app);
    expect(html.match(/href="\/article\/a\d+"/g)).toHaveLength(rowCount);

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRecoverableError = vi.fn();
    const root = await act(async () => hydrateRoot(container, app, { onRecoverableError }));

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelector('ul[data-tree-windowed]')).not.toBeNull();
    expect(container.querySelectorAll('li[data-tree-item]').length).toBeLessThan(rowCount / 4);

    act(() => root.unmount());
    container.remove();
  });

  it('given saved collapsed sections, when rendered, then only their headings take rows', () => {
    saveCollapsed(Array.from({ length: SECTIONS }, (_, section) => sectionId(section)));

    renderTree(largeTree);

    expect(rowsInDom()).toHaveLength(SECTIONS);
    expect(list().style.height).toBe(`${SECTIONS * WINDOWED_ROW_HEIGHT}px`);
    expect(within(link('Раздел 3').closest('li') as HTMLElement).getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('given a section, when its toggle is clicked, then its rows leave the list and the choice is saved', () => {
    renderTree(largeTree);

    fireEvent.click(within(link('Раздел 0').closest('li') as HTMLElement).getByRole('button', { name: 'Свернуть раздел' }));

    expect(queryLink('Статья 0-0')).toBeNull();
    expect(link('Раздел 1').closest('li')?.style.top).toBe(`${WINDOWED_ROW_HEIGHT}px`);
    expect(savedCollapsed()).toEqual([sectionId(0)]);
  });

  it('given a collapsed tree, when the current article is deep in it, then its section is expanded and its row is rendered and scrolled to', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    saveCollapsed(Array.from({ length: SECTIONS }, (_, section) => sectionId(section)));

    renderTree(largeTree, `/article/a${childId(15, 140)}`);

    // Row 15 (the section) + 141: far below the 580px the scroller shows.
    const current = link('Статья 15-140');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(savedCollapsed()).not.toContain(sectionId(15));
    expect(savedCollapsed()).toHaveLength(SECTIONS - 1);
    expect(scrollIntoView.mock.contexts).toContain(current.closest('li'));
    expect(rowsInDom().length).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('given a filtered tree, when sections were collapsed before, then every row is laid out and there are no toggles', () => {
    saveCollapsed([sectionId(0)]);

    renderTree(largeTree, '/', { forceExpanded: true });

    expect(list().style.height).toBe(`${TOTAL_ROWS * WINDOWED_ROW_HEIGHT}px`);
    expect(queryLink('Статья 0-0')).not.toBeNull();
    expect(within(list()).queryByRole('button')).toBeNull();
    expect(savedCollapsed()).toEqual([sectionId(0)]);
  });

  it('given the admin tree, when a row far down is reordered, then the move names its parent and its place among the siblings', () => {
    const onMove = vi.fn();
    renderTree(largeTree, '/admin', { showArticleEditActions: true, onMove });

    scrollTo(1000 * WINDOWED_ROW_HEIGHT);
    const row = link('Статья 6-93').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Переместить ниже' }));

    expect(onMove).toHaveBeenCalledWith(childId(6, 93), sectionId(6), 94);
    expect(link('Статья 6-93').getAttribute('href')).toBe(`/admin/articles/${childId(6, 93)}/edit`);
  });
});

describe('NavigationTree keyboard navigation in windowed mode', () => {
  it('given focus on the first row, when pressing End and Home, then focus reaches rows that were not rendered', () => {
    renderTree(largeTree);
    link('Раздел 0').focus();
    expect(queryLink('Статья 19-149')).toBeNull();

    press('End');
    expect(document.activeElement).toBe(link('Статья 19-149'));

    press('Home');
    expect(document.activeElement).toBe(link('Раздел 0'));
    expect(rowsInDom().length).toBeLessThanOrEqual(MAX_ROWS_IN_DOM);
  });

  it('given focus on a row, when pressing down and up, then focus walks the rows in order across sections', () => {
    saveCollapsed([sectionId(0)]);
    renderTree(largeTree);
    link('Раздел 0').focus();

    press('ArrowDown');
    expect(document.activeElement).toBe(link('Раздел 1'));
    press('ArrowDown');
    expect(document.activeElement).toBe(link('Статья 1-0'));
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(link('Раздел 0'));
  });

  it('given the last article of a long section, when pressing left, then focus moves to its section 150 rows above', () => {
    renderTree(largeTree);
    link('Раздел 0').focus();
    press('End');
    expect(queryLink('Раздел 19')).toBeNull();

    press('ArrowLeft');

    expect(document.activeElement).toBe(link('Раздел 19'));
  });

  it('given a section, when pressing left then right twice, then it collapses, expands and focus steps into it', () => {
    renderTree(largeTree);
    link('Раздел 0').focus();

    press('ArrowLeft');
    expect(savedCollapsed()).toEqual([sectionId(0)]);
    expect(queryLink('Статья 0-0')).toBeNull();
    expect(document.activeElement).toBe(link('Раздел 0'));

    press('ArrowRight');
    expect(savedCollapsed()).toEqual([]);
    press('ArrowRight');
    expect(document.activeElement).toBe(link('Статья 0-0'));
  });

  it('given a stub section without a link, when walking down, then its toggle takes the focus', () => {
    const tree = [...flatTree(NAVIGATION_TREE_WINDOWING_THRESHOLD), { ...node(9001, 'Закят', [node(9002, 'Нисаб')]), hasContent: false }];
    renderTree(tree);
    link('Статья 1').focus();
    press('End');
    expect(document.activeElement).toBe(link('Нисаб'));

    press('ArrowUp');

    expect(document.activeElement).toBe(within(screen.getByText('Закят').closest('li') as HTMLElement).getByRole('button', { name: 'Свернуть раздел' }));
  });

  it('given a focused row, when the list is scrolled far away, then the row stays in the DOM and keeps the focus', () => {
    renderTree(largeTree);
    link('Статья 0-1').focus();

    scrollTo(2000 * WINDOWED_ROW_HEIGHT);

    expect(document.activeElement).toBe(link('Статья 0-1'));
    expect(queryLink('Раздел 0')).toBeNull();
    press('ArrowDown');
    expect(document.activeElement).toBe(link('Статья 0-2'));
  });

  it('given a modifier key, when pressing End, then the tree leaves the key alone', () => {
    renderTree(largeTree);
    link('Раздел 0').focus();

    fireEvent.keyDown(link('Раздел 0'), { key: 'End', ctrlKey: true });

    expect(document.activeElement).toBe(link('Раздел 0'));
  });
});
