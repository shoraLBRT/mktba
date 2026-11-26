import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { LocalizationProvider } from '../localization/provider';
import type { NavigationArticleDto, PopularArticlesDto, RecentArticlesDto } from '../shared/types/ApiTypes';
import HomePage from './HomePage';

const article = (id: number, title: string, slug: string, children: NavigationArticleDto[] = [], hasContent = true): NavigationArticleDto => ({
  id,
  title,
  slug,
  locale: 'ru',
  status: 'Published',
  hasContent,
  canEdit: false,
  isVerified: false,
  children,
});

const TREE = [
  article(1, 'Поклонение', 'pokloneniye', [article(2, 'Салат', 'salat'), article(3, 'Закят', 'zakyat')]),
  article(4, 'Вероубеждение', 'veroubezhdeniye', [], false),
];

const RECENT: RecentArticlesDto = {
  new: [
    { id: 3, title: 'Закят', slug: 'zakyat', summary: 'Обязательная милостыня', publishedAt: '2026-11-10T09:00:00Z', updatedAt: '2026-11-09T09:00:00Z', isVerified: true },
    { id: 2, title: 'Салат', slug: 'salat', summary: null, publishedAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-15T09:00:00Z', isVerified: false },
  ],
  updated: [
    { id: 2, title: 'Салат', slug: 'salat', summary: null, publishedAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-15T09:00:00Z', isVerified: false },
  ],
};

const POPULAR: PopularArticlesDto = {
  days: 30,
  items: [
    { id: 2, title: 'Салат', slug: 'salat', summary: 'Пятикратная молитва', isVerified: false },
    { id: 3, title: 'Закят', slug: 'zakyat', summary: null, isVerified: true },
  ],
};

/** Where the router is, for the tests that navigate. */
const CurrentLocation = () => {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{pathname + search}</span>;
};

/** The page over a cache that already holds the data, as after the server render. */
const renderHome = (tree: NavigationArticleDto[] = TREE, recent: RecentArticlesDto = RECENT, popular: PopularArticlesDto = POPULAR) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE, 'ru'], tree);
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.RECENT_ARTICLES, 'ru'], recent);
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.POPULAR_ARTICLES, 'ru'], popular);

  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter>
          <HomePage />
          <CurrentLocation />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

const region = (name: string) => screen.getByRole('region', { name });

describe('HomePage', () => {
  it('given the tree, when rendered, then lists the top-level sections with their nested articles', () => {
    renderHome();

    const sections = region('Разделы');
    expect(within(sections).getByRole('link', { name: 'Поклонение' }).getAttribute('href')).toBe('/pokloneniye');
    expect(within(sections).getByRole('link', { name: 'Салат' }).getAttribute('href')).toBe('/salat');
    expect(within(sections).getByText('Вероубеждение').closest('a')).toBeNull();
  });

  it('given new and updated articles, when rendered, then shows both lists with their dates', () => {
    renderHome();

    const fresh = within(region('Новые статьи')).getAllByRole('listitem');
    expect(fresh.map((item) => within(item).getByRole('link').textContent)).toEqual(['Закят', 'Салат']);
    expect(fresh[0].textContent).toContain('Обязательная милостыня');
    expect(fresh[0].textContent).toMatch(/Опубликовано 10 ноября 2026/);
    expect(fresh[0].querySelector('time')?.getAttribute('datetime')).toBe('2026-11-10T09:00:00.000Z');

    const updated = within(region('Обновлённые статьи')).getAllByRole('listitem');
    expect(updated).toHaveLength(1);
    expect(updated[0].textContent).toMatch(/Обновлено 15 ноября 2026/);
    // V-08 (#124): the verified article carries the mark, the other does not.
    expect(fresh.map((item) => item.textContent?.includes('Проверено учёными'))).toEqual([true, false]);
  });

  it('given viewed articles, when rendered, then lists the popular ones in the order of the server', () => {
    renderHome();

    const popular = within(region('Популярные статьи')).getAllByRole('listitem');
    expect(popular.map((item) => within(item).getByRole('link').textContent)).toEqual(['Салат', 'Закят']);
    expect(within(popular[0]).getByRole('link').getAttribute('href')).toBe('/salat');
    expect(popular[0].textContent).toContain('Пятикратная молитва');
    expect(popular.map((item) => item.textContent?.includes('Проверено учёными'))).toEqual([false, true]);
  });

  it('given nothing published yet, when rendered, then says so and leaves the updated and popular lists out', () => {
    renderHome([], { new: [], updated: [] }, { days: 30, items: [] });

    expect(region('Разделы').textContent).toContain('Разделов пока нет.');
    expect(region('Новые статьи').textContent).toContain('Опубликованных статей пока нет.');
    expect(screen.queryByRole('region', { name: 'Обновлённые статьи' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Популярные статьи' })).toBeNull();
  });

  it('given a typed query, when the search form is submitted, then opens the results page for it', () => {
    renderHome();
    const form = screen.getByRole('search');
    expect(form.getAttribute('action')).toBe('/search');

    fireEvent.change(within(form).getByRole('searchbox', { name: 'Поиск по статьям' }), { target: { value: '  условия   намаза ' } });
    fireEvent.submit(form);

    expect(screen.getByTestId('location').textContent).toBe('/search?q=%D1%83%D1%81%D0%BB%D0%BE%D0%B2%D0%B8%D1%8F+%D0%BD%D0%B0%D0%BC%D0%B0%D0%B7%D0%B0');
  });

  it('when rendered, then has one h1 and explains what mktba is', () => {
    renderHome();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(region('Что такое mktba').textContent).toContain('открытая исламская wiki');
  });
});
