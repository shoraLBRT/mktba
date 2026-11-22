import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorAnalytics } from '../../services/adminService';
import type { AuthorAnalyticsDto } from '../../shared/types/ApiTypes';
import { AuthorAnalyticsSection } from './AuthorAnalyticsSection';

vi.mock('../../services/adminService', () => ({ getAuthorAnalytics: vi.fn() }));

const fetchAnalytics = vi.mocked(getAuthorAnalytics);

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AuthorAnalyticsSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const analytics: AuthorAnalyticsDto = {
  days: 2,
  from: '2026-11-19',
  to: '2026-11-20',
  totals: { views: 10, readers: 5, articlesViewed: 2 },
  daily: [
    { day: '2026-11-19', views: 6, readers: 3 },
    { day: '2026-11-20', views: 4, readers: 2 },
  ],
  topArticles: [
    { articleId: 1, title: 'Намаз', slug: 'namaz', views: 8, readers: 4, depth: { views: 8, reachedDepth25: 8, reachedDepth50: 6, reachedDepth75: 4, reachedDepth100: 2 } },
    { articleId: 2, title: 'Пост', slug: 'post', views: 2, readers: 1, depth: { views: 2, reachedDepth25: 2, reachedDepth50: 2, reachedDepth75: 2, reachedDepth100: 2 } },
  ],
  depth: { views: 10, reachedDepth25: 10, reachedDepth50: 8, reachedDepth75: 6, reachedDepth100: 4 },
  schools: [{ schoolId: 3, name: 'Ханафитский', views: 4, readers: 3 }],
  viewsWithoutSchool: 6,
  aggregatedAtUtc: '2026-11-20T14:00:00Z',
};

describe('AuthorAnalyticsSection', () => {
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it('given the statistics, when shown, then gives the totals, the days, the top articles, the read depth and the mazhabs', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();

    expect(within(await screen.findByTestId('author-analytics-views')).getByText('10')).toBeTruthy();
    expect(within(screen.getByTestId('author-analytics-readers')).getByText('5')).toBeTruthy();
    expect(within(screen.getByTestId('author-analytics-articles')).getByText('2')).toBeTruthy();
    expect(within(screen.getByTestId('author-analytics-finished')).getByText('40%')).toBeTruthy();
    expect(fetchAnalytics).toHaveBeenCalledWith(30);

    const days = screen.getAllByTestId('author-analytics-day');
    expect(days).toHaveLength(2);
    expect(days[0].querySelector('title')?.textContent).toMatch(/^19 нояб.*: просмотров — 6, читателей — 3$/);
    expect(screen.getByRole('img', { name: 'Просмотры ваших статей и читатели по дням' })).toBeTruthy();

    const top = screen.getByTestId('author-analytics-top-articles');
    expect(within(top).getByRole('link', { name: 'Намаз' }).getAttribute('href')).toBe('/namaz');
    expect(within(top).getByText('25%')).toBeTruthy();
    expect(within(top).getByText('100%')).toBeTruthy();

    const depth = screen.getByTestId('author-analytics-depth');
    expect(within(depth).getByText('Половина')).toBeTruthy();
    expect(within(depth).getByText('8 · 80%')).toBeTruthy();
    expect(within(depth).getByText('4 · 40%')).toBeTruthy();

    const schools = screen.getByTestId('author-analytics-schools');
    expect(within(schools).getByText('Ханафитский')).toBeTruthy();
    expect(within(schools).getByText('4 · 40%')).toBeTruthy();
    expect(within(schools).getByText('Мазхаб не выбран')).toBeTruthy();
    expect(screen.getByTestId('author-analytics-search-note').textContent).toMatch(/Яндекс Метрике/);
    expect(screen.getByTestId('author-analytics-freshness').textContent).toMatch(/^Обновлено: /);
  });

  it('given another period chosen, when clicked, then asks for that many days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();
    await screen.findByTestId('author-analytics-views');

    fireEvent.click(screen.getByRole('button', { name: '90 дн.' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith(90);
    expect(screen.getByRole('button', { name: '90 дн.' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('given no views yet, when shown, then says so instead of listing articles', async () => {
    fetchAnalytics.mockResolvedValue({
      ...analytics,
      totals: { views: 0, readers: 0, articlesViewed: 0 },
      daily: analytics.daily.map((day) => ({ ...day, views: 0, readers: 0 })),
      topArticles: [],
      depth: { views: 0, reachedDepth25: 0, reachedDepth50: 0, reachedDepth75: 0, reachedDepth100: 0 },
      schools: [],
      viewsWithoutSchool: 0,
      aggregatedAtUtc: null,
    });

    renderSection();

    expect((await screen.findAllByText('За этот период ваши статьи не просматривали.')).length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('author-analytics-finished')).getByText('0%')).toBeTruthy();
    expect(screen.queryByTestId('author-analytics-top-articles')).toBeNull();
    expect(screen.getByTestId('author-analytics-freshness').textContent).toMatch(/ещё не построены/);
  });

  it('given the request fails, when shown, then says so', async () => {
    fetchAnalytics.mockRejectedValue(new Error('boom'));

    renderSection();

    expect(await screen.findByText('Не удалось загрузить статистику.')).toBeTruthy();
  });
});
