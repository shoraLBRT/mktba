import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteUrlContext } from '../app/siteUrl';
import { LocalizationProvider } from '../localization/provider';
import { getTagPage } from '../services/tagService';
import { ApiError } from '../shared/api-client/apiError';
import { tagPageQueryKey } from '../shared/tag';
import type { TagPageDto } from '../shared/types/ApiTypes';
import TagPage from './TagPage';

vi.mock('../services/tagService', () => ({ getTagPage: vi.fn() }));

const tagPage = (overrides: Partial<TagPageDto> = {}): TagPageDto => ({
  name: 'Фикх',
  slug: 'fikkh',
  total: 2,
  page: 1,
  pageSize: 20,
  items: [
    { id: 2, title: 'Условия намаза', slug: 'salat', summary: 'Кратко о намазе', publishedAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z' },
    { id: 1, title: 'Закят', slug: 'zakyat', summary: null, publishedAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
  ],
  ...overrides,
});

/** The page at `url` over a cache that already holds the tag page, as after the server render. */
const renderTag = (url: string, data?: TagPageDto) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (data) client.setQueryData(tagPageQueryKey(data.slug, data.page), data);
  const Stub = createRoutesStub([{ path: '/tags/:slug', Component: TagPage }]);

  return render(
    <QueryClientProvider client={client}>
      <SiteUrlContext.Provider value="https://mktba.ru">
        <LocalizationProvider>
          <Stub initialEntries={[url]} />
        </LocalizationProvider>
      </SiteUrlContext.Provider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.mocked(getTagPage).mockReset();
});

describe('TagPage', () => {
  it('given a tag with articles, when rendered, then shows the name and the articles with dates, indexable at its canonical', () => {
    renderTag('/tags/fikkh', tagPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Фикх' })).toBeTruthy();
    expect(screen.getByText('2 статьи')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Статьи с этим тегом' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/salat', '/zakyat']);
    expect(list.textContent).toContain('Кратко о намазе');
    expect(document.title).toBe('Тег «Фикх» — mktba');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/tags/fikkh');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('given a later page of a long list, when rendered, then it links both ways and is kept out of the index', () => {
    renderTag('/tags/fikkh?page=2', tagPage({ total: 45, page: 2 }));

    const pages = screen.getByRole('navigation', { name: 'Страницы списка статей' });
    expect(within(pages).getByRole('link', { name: '← Назад' }).getAttribute('href')).toBe('/tags/fikkh');
    expect(within(pages).getByRole('link', { name: 'Вперёд →' }).getAttribute('href')).toBe('/tags/fikkh?page=3');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('given a tag the API does not have, when opened in the browser, then the 404 page is shown', async () => {
    vi.mocked(getTagPage).mockRejectedValue(new ApiError('not found', 404, 'tag_not_found'));

    renderTag('/tags/nothing');

    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });

  it('given the API failing, when opened in the browser, then says so and offers to try again', async () => {
    vi.mocked(getTagPage).mockRejectedValue(new ApiError('boom', 500));

    renderTag('/tags/fikkh');

    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить страницу тега.');
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeTruthy();
  });
});
