import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSiteAnalytics } from '../../services/adminService';
import type { SiteAnalyticsDto } from '../../shared/types/ApiTypes';
import { LocalizationProvider } from '../../localization/provider';
import { SiteAnalyticsSection } from './SiteAnalyticsSection';

vi.mock('../../services/adminService', () => ({ getSiteAnalytics: vi.fn() }));

const fetchAnalytics = vi.mocked(getSiteAnalytics);

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <SiteAnalyticsSection />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const analytics: SiteAnalyticsDto = {
  days: 2,
  from: '2026-11-19',
  to: '2026-11-20',
  totals: { articleViews: 12, visitors: 7, searches: 3 },
  daily: [
    { day: '2026-11-19', articleViews: 7, visitors: 3, searches: 2 },
    { day: '2026-11-20', articleViews: 5, visitors: 4, searches: 1 },
  ],
  topArticles: [
    { articleId: 1, title: 'Намаз', slug: 'namaz', views: 7, readers: 5 },
    { articleId: 9, title: null, slug: null, views: 2, readers: 1 },
  ],
  schools: [
    { schoolId: 3, name: 'Ханафитский', views: 3, readers: 2 },
    { schoolId: 8, name: null, views: 3, readers: 1 },
  ],
  viewsWithoutSchool: 6,
  aggregatedAtUtc: '2026-11-20T14:00:00Z',
};

describe('SiteAnalyticsSection', () => {
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it('given the statistics, when shown, then gives the totals, a bar pair per day, the top articles and the mazhabs', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();

    expect(within(await screen.findByTestId('site-analytics-views')).getByText('12')).toBeTruthy();
    expect(within(screen.getByTestId('site-analytics-visitors')).getByText('7')).toBeTruthy();
    expect(within(screen.getByTestId('site-analytics-searches')).getByText('3')).toBeTruthy();
    expect(fetchAnalytics).toHaveBeenCalledWith(30);

    const days = screen.getAllByTestId('site-analytics-day');
    expect(days).toHaveLength(2);
    expect(days[0].querySelector('title')?.textContent).toMatch(/^19 нояб.*: просмотров — 7, посетителей — 3, поисков — 2$/);
    expect(screen.getByRole('img', { name: 'Просмотры статей и посетители по дням' })).toBeTruthy();

    const top = screen.getByTestId('site-analytics-top-articles');
    expect(within(top).getByRole('link', { name: 'Намаз' }).getAttribute('href')).toBe('/namaz');
    expect(within(top).getByText('Удалённая статья №9')).toBeTruthy();

    const schools = screen.getByTestId('site-analytics-schools');
    expect(within(schools).getByText('Ханафитский')).toBeTruthy();
    expect(within(schools).getByText('Удалённая школа №8')).toBeTruthy();
    expect(within(schools).getByText('Мазхаб не выбран')).toBeTruthy();
    expect(within(schools).getByText('6 · 50%')).toBeTruthy();
    expect(screen.getByTestId('site-analytics-freshness').textContent).toMatch(/^Обновлено: /);
  });

  it('given another period chosen, when clicked, then asks for that many days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();
    await screen.findByTestId('site-analytics-views');

    fireEvent.click(screen.getByRole('button', { name: '7 дн.' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith(7);
    expect(screen.getByRole('button', { name: '7 дн.' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('given no events yet, when shown, then says so and that the summaries are not built', async () => {
    fetchAnalytics.mockResolvedValue({
      ...analytics,
      totals: { articleViews: 0, visitors: 0, searches: 0 },
      daily: analytics.daily.map((day) => ({ ...day, articleViews: 0, visitors: 0, searches: 0 })),
      topArticles: [],
      schools: [],
      viewsWithoutSchool: 0,
      aggregatedAtUtc: null,
    });

    renderSection();

    expect(await screen.findByText('За этот период событий нет.')).toBeTruthy();
    expect(screen.getByTestId('site-analytics-freshness').textContent).toMatch(/ещё не построены/);
    expect(screen.queryByTestId('site-analytics-top-articles')).toBeNull();
  });

  it('given the request fails, when shown, then says so', async () => {
    fetchAnalytics.mockRejectedValue(new Error('boom'));

    renderSection();

    expect(await screen.findByText('Не удалось загрузить статистику.')).toBeTruthy();
  });
});
