import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../localization/provider';
import { searchQueryKey } from '../shared/search';
import type { SearchResultsDto } from '../shared/types/ApiTypes';
import SearchPage from './SearchPage';

const results = (overrides: Partial<SearchResultsDto> = {}): SearchResultsDto => ({
  query: 'намаз',
  total: 2,
  page: 1,
  pageSize: 10,
  items: [
    {
      id: 1,
      slug: 'salat',
      title: [{ text: 'Условия ', match: false }, { text: 'намаза', match: true }],
      summary: [{ text: 'Кратко о ', match: false }, { text: 'намазе', match: true }],
      snippet: [{ text: '<img src=x onerror=alert(1)> ', match: false }, { text: 'намаз', match: true }, { text: ' совершается…', match: false }],
      paragraphId: 7,
    },
    { id: 2, slug: 'zakyat', title: [{ text: 'Закят', match: false }], summary: null, snippet: null, paragraphId: null },
  ],
  ...overrides,
});

const CurrentLocation = () => {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{pathname + search}</span>;
};

/** The page at `url` over a cache that already holds `data` for that URL's request, as after the server render. */
const renderSearch = (url: string, data?: SearchResultsDto) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (data) {
    client.setQueryData(searchQueryKey({ query: data.query, page: data.page }), data);
  }

  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[url]}>
          <SearchPage />
          <CurrentLocation />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

describe('SearchPage', () => {
  it('given results, when rendered, then lists them with the matched words marked and links to the article', () => {
    renderSearch('/search?q=намаз', results());

    expect(screen.getByRole('status').textContent).toContain('Найдено статей: 2');
    const items = within(screen.getByRole('list', { name: 'Результаты поиска' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole('link', { name: 'Условия намаза' }).getAttribute('href')).toBe('/salat#p-7');
    expect([...items[0].querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['намаза', 'намазе', 'намаз']);
    expect(within(items[1]).getByRole('link', { name: 'Закят' }).getAttribute('href')).toBe('/zakyat');
    expect(items[1].querySelector('mark')).toBeNull();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('намаз');
  });

  it('given markup in a result, when rendered, then it is shown as text and never becomes an element', () => {
    const { container } = renderSearch('/search?q=намаз', results());

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('given no matches, when rendered, then says nothing was found and suggests what to try', () => {
    renderSearch('/search?q=абракадабра', results({ query: 'абракадабра', total: 0, items: [] }));

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('По запросу абракадабра ничего не найдено.');
    expect(within(status).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(status).getByRole('link', { name: 'Посмотреть разделы на главной' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('list', { name: 'Результаты поиска' })).toBeNull();
  });

  it.each(['/search', '/search?q=', '/search?q=%20я%20'])('given %s, when rendered, then asks for a query and searches nothing', (url) => {
    renderSearch(url);

    expect(screen.getByRole('status').textContent).toContain('Введите запрос — не меньше 2 символов.');
    expect(screen.queryByText('Ищем…')).toBeNull();
  });

  it('given a query longer than the limit, when rendered, then says it is too long', () => {
    renderSearch(`/search?q=${'а'.repeat(201)}`);

    expect(screen.getByRole('status').textContent).toContain('Запрос слишком длинный: не больше 200 символов.');
  });

  it('given more results than a page, when on the second page, then links to the previous and the next page', () => {
    renderSearch('/search?q=намаз&page=2', results({ total: 25, page: 2 }));

    const paging = screen.getByRole('navigation', { name: 'Страницы результатов' });
    expect(paging.textContent).toContain('Страница 2 из 3');
    expect(within(paging).getByRole('link', { name: '← Назад' }).getAttribute('href')).toBe('/search?q=%D0%BD%D0%B0%D0%BC%D0%B0%D0%B7');
    expect(within(paging).getByRole('link', { name: 'Вперёд →' }).getAttribute('href')).toBe('/search?q=%D0%BD%D0%B0%D0%BC%D0%B0%D0%B7&page=3');
  });

  it('given one page of results, when rendered, then shows no paging', () => {
    renderSearch('/search?q=намаз', results());

    expect(screen.queryByRole('navigation', { name: 'Страницы результатов' })).toBeNull();
  });

  it('given a new query typed on the page, when submitted, then the URL carries it from the first page', () => {
    renderSearch('/search?q=намаз&page=2', results({ total: 25, page: 2 }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'закят' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(screen.getByTestId('location').textContent).toBe('/search?q=%D0%B7%D0%B0%D0%BA%D1%8F%D1%82');
  });
});
