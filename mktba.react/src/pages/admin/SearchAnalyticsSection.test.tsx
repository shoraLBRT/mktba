import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getSearchAnalytics } from '../../services/adminService';
import type { SearchAnalyticsDto } from '../../shared/types/ApiTypes';
import { SearchAnalyticsSection } from './SearchAnalyticsSection';

vi.mock('../../services/adminService', () => ({ getSearchAnalytics: vi.fn() }));

const fetchAnalytics = vi.mocked(getSearchAnalytics);

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <SearchAnalyticsSection />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const analytics: SearchAnalyticsDto = {
  days: 30,
  from: '2026-10-22',
  to: '2026-11-20',
  totals: { searches: 20, searchesWithoutResults: 5 },
  topQueries: [
    { query: 'намаз', searches: 9, searchers: 6, searchesWithoutResults: 0 },
    { query: 'закят с золота', searches: 4, searchers: 3, searchesWithoutResults: 4 },
  ],
  queriesWithoutResults: [{ query: 'закят с золота', searches: 4, searchers: 3, searchesWithoutResults: 4 }],
  minSearchers: 2,
  aggregatedAtUtc: '2026-11-20T14:00:00Z',
};

describe('SearchAnalyticsSection', () => {
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it('given the analytics, when shown, then gives the totals, the queries without results and the popular ones linking to the search', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();

    expect(within(await screen.findByTestId('search-analytics-searches')).getByText('20')).toBeTruthy();
    const withoutResults = screen.getByTestId('search-analytics-without-results');
    expect(within(withoutResults).getByText('5')).toBeTruthy();
    expect(within(withoutResults).getByText('Доля от всех поисков: 25%.')).toBeTruthy();
    expect(fetchAnalytics).toHaveBeenCalledWith(30);
    expect(screen.getByTestId('search-analytics-privacy').textContent).toContain('не меньше 2');

    const missing = within(screen.getByTestId('search-analytics-queries-without-results')).getAllByRole('link');
    expect(missing.map((link) => link.textContent)).toEqual(['закят с золота']);
    expect(missing[0].getAttribute('href')).toBe('/search?q=%D0%B7%D0%B0%D0%BA%D1%8F%D1%82+%D1%81+%D0%B7%D0%BE%D0%BB%D0%BE%D1%82%D0%B0');

    const top = within(screen.getByTestId('search-analytics-top-queries')).getAllByRole('row');
    expect(top).toHaveLength(3);
    expect(within(top[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['намаз', '9', '6', '0']);
    expect(screen.getByTestId('search-analytics-external')).toBeTruthy();
  });

  it('given no queries to show, when shown, then says so instead of empty tables', async () => {
    fetchAnalytics.mockResolvedValue({ ...analytics, totals: { searches: 1, searchesWithoutResults: 1 }, topQueries: [], queriesWithoutResults: [] });

    renderSection();

    expect(await screen.findByText('За этот период запросов, которые можно показать, нет.')).toBeTruthy();
    expect(screen.getByText('За этот период все показанные запросы что-то нашли.')).toBeTruthy();
    expect(screen.queryByTestId('search-analytics-top-queries')).toBeNull();
  });

  it('given another period chosen, when clicked, then asks for that many days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();
    await screen.findByTestId('search-analytics-searches');
    fireEvent.click(screen.getByRole('button', { name: '7 дн.' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith(7);
  });

  it('given the request fails, when shown, then says so', async () => {
    fetchAnalytics.mockRejectedValue(new Error('boom'));

    renderSection();

    expect(await screen.findByText('Не удалось загрузить статистику.')).toBeTruthy();
  });
});
