import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, resetNavigationTreeStateForTests } from '../shared/navigationTreeState';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';
import NavigationTree from './NavigationTree';

const node = (id: number, title: string, children: NavigationArticleDto[] = []) =>
  ({ id, title, slug: `a${id}`, status: 'Published', hasContent: true, canEdit: id !== 4, children }) as unknown as NavigationArticleDto;

const tree = [node(1, 'Намаз', [node(2, 'Условия'), node(3, 'Время')]), node(4, 'Пост')];

const rowOf = (title: string) => screen.getByRole('link', { name: title }).parentElement as HTMLElement;

const renderAdminTree = (onMove = vi.fn(), onChangeParent = vi.fn()) => {
  render(
    <LocalizationProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <NavigationTree navigationTree={tree} showArticleEditActions onMove={onMove} onChangeParent={onChangeParent} />
      </MemoryRouter>
    </LocalizationProvider>,
  );
  return { onMove, onChangeParent };
};

describe('NavigationTree reorder controls', () => {
  it('given the first of two children, when moving it down, then asks for index 1 under its parent', () => {
    const { onMove } = renderAdminTree();

    fireEvent.click(within(rowOf('Условия')).getByRole('button', { name: 'Переместить ниже' }));

    expect(onMove).toHaveBeenCalledWith(2, 1, 1);
  });

  it('given the last root, when moving it up, then asks for index 0 at the top level', () => {
    const { onMove } = renderAdminTree();

    fireEvent.click(within(rowOf('Пост')).getByRole('button', { name: 'Переместить выше' }));

    expect(onMove).toHaveBeenCalledWith(4, null, 0);
  });

  it('given the first and last siblings, when rendered, then up and down are disabled at the ends', () => {
    renderAdminTree();

    expect(within(rowOf('Условия')).getByRole('button', { name: 'Переместить выше' })).toHaveProperty('disabled', true);
    expect(within(rowOf('Время')).getByRole('button', { name: 'Переместить ниже' })).toHaveProperty('disabled', true);
  });

  it('given a child, when choosing another section, then hands over the article and its current parent', () => {
    const { onChangeParent } = renderAdminTree();

    fireEvent.click(within(rowOf('Время')).getByRole('button', { name: 'Переместить в другой раздел' }));

    expect(onChangeParent).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 1);
  });

  it('given a reader tree, when rendered, then shows no reorder controls', () => {
    render(
      <LocalizationProvider>
        <MemoryRouter>
          <NavigationTree navigationTree={tree} />
        </MemoryRouter>
      </LocalizationProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Переместить выше' })).toBeNull();
  });
});

describe('NavigationTree edit links', () => {
  it('given an admin tree, when an article is editable, then it links to its editor, otherwise to the reader page', () => {
    renderAdminTree();

    expect(screen.getByRole('link', { name: 'Намаз' }).getAttribute('href')).toBe('/admin/articles/1/edit');
    expect(screen.getByRole('link', { name: 'Пост' }).getAttribute('href')).not.toContain('/admin/');
  });
});

const deepTree = [
  node(1, 'Намаз', [node(2, 'Условия', [node(5, 'Омовение')]), node(3, 'Время')]),
  node(4, 'Пост'),
  { ...node(6, 'Закят', [node(7, 'Нисаб')]), hasContent: false },
];

const renderReaderTree = (path = '/', props: Partial<React.ComponentProps<typeof NavigationTree>> = {}) =>
  render(
    <LocalizationProvider>
      <MemoryRouter initialEntries={[path]}>
        <NavigationTree navigationTree={deepTree} {...props} />
      </MemoryRouter>
    </LocalizationProvider>,
  );

const saveCollapsed = (ids: number[]) => {
  localStorage.setItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify(ids));
  resetNavigationTreeStateForTests();
};

const savedCollapsed = () => JSON.parse(localStorage.getItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY) ?? '[]') as number[];

const toggleOf = (title: string) => within(rowOf(title)).getByRole('button', { name: /раздел/ });

describe('NavigationTree collapsing', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNavigationTreeStateForTests();
  });

  it('given an untouched tree, when rendered, then every section is expanded', () => {
    renderReaderTree();

    expect(screen.getByRole('link', { name: 'Омовение' })).toBeTruthy();
    expect(toggleOf('Намаз').getAttribute('aria-expanded')).toBe('true');
  });

  it('given a section, when it is collapsed, then its children disappear and the choice is saved', () => {
    renderReaderTree();

    fireEvent.click(toggleOf('Намаз'));

    expect(screen.queryByRole('link', { name: 'Условия' })).toBeNull();
    expect(toggleOf('Намаз').getAttribute('aria-expanded')).toBe('false');
    expect(savedCollapsed()).toEqual([1]);
  });

  it('given a saved collapsed section, when the tree is opened again, then the section stays collapsed', () => {
    saveCollapsed([2]);

    renderReaderTree();

    expect(screen.getByRole('link', { name: 'Условия' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Омовение' })).toBeNull();
  });

  it('given two trees on the page, when a section is collapsed in one, then the other follows', () => {
    renderReaderTree();
    renderReaderTree();

    fireEvent.click(within(screen.getAllByRole('link', { name: 'Намаз' })[0].parentElement as HTMLElement).getByRole('button'));

    expect(screen.queryAllByRole('link', { name: 'Условия' })).toHaveLength(0);
  });

  it('given collapsed ancestors, when their descendant is the current article, then the path to it is expanded and saved so', () => {
    saveCollapsed([1, 2, 6]);

    renderReaderTree('/a5');

    expect(screen.getByRole('link', { name: 'Омовение' }).getAttribute('aria-current')).toBe('page');
    expect(savedCollapsed()).toEqual([6]);
  });

  it('given saved garbage, when rendered, then the tree is expanded', () => {
    localStorage.setItem(NAVIGATION_TREE_COLLAPSED_STORAGE_KEY, '{"oops":true');
    resetNavigationTreeStateForTests();

    renderReaderTree();

    expect(screen.getByRole('link', { name: 'Омовение' })).toBeTruthy();
  });

  it('given a saved collapsed section, when rendered on the server, then the HTML still holds every link', () => {
    saveCollapsed([1, 6]);

    const html = renderToString(
      <LocalizationProvider>
        <MemoryRouter>
          <NavigationTree navigationTree={deepTree} />
        </MemoryRouter>
      </LocalizationProvider>,
    );

    for (const slug of ['a1', 'a2', 'a3', 'a4', 'a5', 'a7']) {
      expect(html).toContain(`href="/${slug}"`);
    }
  });

  it('given a filtered tree, when a section was collapsed before, then it is shown expanded without a toggle', () => {
    saveCollapsed([1]);

    renderReaderTree('/', { forceExpanded: true });

    expect(screen.getByRole('link', { name: 'Омовение' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /раздел/ })).toBeNull();
    expect(savedCollapsed()).toEqual([1]);
  });
});

describe('NavigationTree child counter', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNavigationTreeStateForTests();
  });

  it('given a section, when rendered, then it shows how many direct children it has, and a leaf shows nothing', () => {
    renderReaderTree();

    expect(within(rowOf('Намаз')).getByText('Подразделов: 2')).toBeTruthy();
    expect(within(rowOf('Условия')).getByText('Подразделов: 1')).toBeTruthy();
    expect(within(rowOf('Пост')).queryByText(/Подразделов/)).toBeNull();
  });
});

describe('NavigationTree keyboard navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNavigationTreeStateForTests();
  });

  const link = (title: string) => screen.getByRole('link', { name: title });
  const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

  it('given focus on a row, when pressing down and up, then focus walks the visible rows in order', () => {
    renderReaderTree();
    link('Намаз').focus();

    press('ArrowDown');
    expect(document.activeElement).toBe(link('Условия'));
    press('ArrowDown');
    expect(document.activeElement).toBe(link('Омовение'));
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(link('Намаз'));
  });

  it('given a collapsed section, when pressing down, then its hidden children are skipped', () => {
    saveCollapsed([1]);
    renderReaderTree();
    link('Намаз').focus();

    press('ArrowDown');

    expect(document.activeElement).toBe(link('Пост'));
  });

  it('given an expanded section, when pressing left then right, then it collapses and expands again', () => {
    renderReaderTree();
    link('Намаз').focus();

    press('ArrowLeft');
    expect(screen.queryByRole('link', { name: 'Условия' })).toBeNull();

    press('ArrowRight');
    expect(link('Условия')).toBeTruthy();
    expect(document.activeElement).toBe(link('Намаз'));
  });

  it('given an expanded section, when pressing right, then focus moves to its first child', () => {
    renderReaderTree();
    link('Намаз').focus();

    press('ArrowRight');

    expect(document.activeElement).toBe(link('Условия'));
  });

  it('given a leaf, when pressing left, then focus moves to its parent', () => {
    renderReaderTree();
    link('Омовение').focus();

    press('ArrowLeft');

    expect(document.activeElement).toBe(link('Условия'));
  });

  it('given a stub section without a link, when walking down, then its toggle takes the focus', () => {
    renderReaderTree();
    link('Пост').focus();

    press('ArrowDown');

    expect(document.activeElement).toBe(screen.getByText('Закят').parentElement?.querySelector('button'));
  });

  it('given focus in the middle, when pressing End and Home, then focus jumps to the last and the first row', () => {
    renderReaderTree();
    link('Время').focus();

    press('End');
    expect(document.activeElement).toBe(link('Нисаб'));
    press('Home');
    expect(document.activeElement).toBe(link('Намаз'));
  });

  it('given a modifier key, when pressing an arrow, then the tree leaves the key alone', () => {
    renderReaderTree();
    link('Намаз').focus();

    fireEvent.keyDown(link('Намаз'), { key: 'ArrowDown', altKey: true });

    expect(document.activeElement).toBe(link('Намаз'));
  });
});

