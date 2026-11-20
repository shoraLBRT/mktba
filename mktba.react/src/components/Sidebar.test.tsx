import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { getNavigationTree } from '../services/Article/navigationService';
import type { NavigationArticleDto } from '../shared/types/ApiTypes';
import Sidebar from './Sidebar';

vi.mock('../services/Article/navigationService', () => ({
  getNavigationTree: vi.fn(),
}));

const fetchTree = vi.mocked(getNavigationTree);

const tree = [
  { id: 1, title: 'Намаз', slug: 'namaz', hasContent: true, status: 'Published', children: [] },
] as unknown as NavigationArticleDto[];

const renderSidebar = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LocalizationProvider>
          <Sidebar collapsed={false} />
        </LocalizationProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const desktopTree = () => within(screen.getAllByRole('navigation', { name: /./ })[0]);

afterEach(() => {
  fetchTree.mockReset();
});

describe('Sidebar loading and empty states (R-14)', () => {
  it('given the tree is still loading, when rendered, then a loading status stands in for the rows', () => {
    fetchTree.mockReturnValue(new Promise(() => {}));
    renderSidebar();

    expect(desktopTree().getByRole('status').textContent).toBe('Загрузка...');
    expect(desktopTree().queryByRole('list')).toBeNull();
  });

  it('given no published articles, when loaded, then the tree says so instead of an empty list', async () => {
    fetchTree.mockResolvedValue([]);
    renderSidebar();

    expect(await desktopTree().findByText('Опубликованных статей пока нет.')).toBeTruthy();
    expect(desktopTree().queryByRole('list')).toBeNull();
  });

  it('given a filter no title matches, when typed, then the tree offers the full-text search for it', async () => {
    fetchTree.mockResolvedValue(tree);
    renderSidebar();
    await desktopTree().findByRole('link', { name: /Намаз/ });

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '  омовение  ' } });

    expect(desktopTree().getByText('Среди названий статей совпадений нет.')).toBeTruthy();
    expect(desktopTree().getByRole('link', { name: 'Искать «омовение» в тексте статей' }).getAttribute('href'))
      .toBe('/search?q=%D0%BE%D0%BC%D0%BE%D0%B2%D0%B5%D0%BD%D0%B8%D0%B5');
  });

  it('given a one-letter filter with no match, when typed, then no search link is offered', async () => {
    fetchTree.mockResolvedValue(tree);
    renderSidebar();
    await desktopTree().findByRole('link', { name: /Намаз/ });

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'ы' } });

    expect(desktopTree().getByText('Среди названий статей совпадений нет.')).toBeTruthy();
    expect(desktopTree().queryByRole('link', { name: /Искать/ })).toBeNull();
  });
});
