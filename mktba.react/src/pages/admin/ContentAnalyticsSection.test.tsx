import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getContentAnalytics } from '../../services/adminService';
import type { ContentAnalyticsDto, ContentArticleDto } from '../../shared/types/ApiTypes';
import { ContentAnalyticsSection } from './ContentAnalyticsSection';

vi.mock('../../services/adminService', () => ({ getContentAnalytics: vi.fn() }));

const fetchAnalytics = vi.mocked(getContentAnalytics);

const renderSection = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <ContentAnalyticsSection />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const article = (articleId: number, title: string, views: number, readers = views): ContentArticleDto => ({
  articleId,
  title,
  slug: `article-${articleId}`,
  publishedAt: '2025-01-10T10:00:00Z',
  updatedAt: '2025-02-01T10:00:00Z',
  views,
  readers,
});

const analytics: ContentAnalyticsDto = {
  days: 30,
  from: '2026-10-22',
  to: '2026-11-20',
  articlesWithoutViews: { total: 73, items: [article(1, 'Забытая', 0)] },
  stubsWithTraffic: { total: 1, items: [article(2, 'Заглушка', 12, 9)] },
  uncoveredBlocks: {
    total: 1,
    items: [{
      articleId: 3,
      title: 'Намаз',
      slug: 'namaz',
      paragraphId: 30,
      position: 2,
      opinions: 2,
      missingSchools: ['Маликитский', 'Ханбалитский'],
      missingSchoolViews: 7,
      articleViews: 40,
    }],
  },
  staleArticles: { total: 1, items: [article(4, 'Старая', 5)] },
  staleAfterDays: 365,
  aggregatedAtUtc: '2026-11-20T14:00:00Z',
};

describe('ContentAnalyticsSection', () => {
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it('given the analytics, when shown, then gives the counts and the four lists linking to the article and its editor', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();

    expect(within(await screen.findByTestId('content-analytics-without-views-total')).getByText('73')).toBeTruthy();
    expect(fetchAnalytics).toHaveBeenCalledWith({ days: 30 });
    expect(screen.getByText('Показаны 1 из 73.')).toBeTruthy();

    const stubRows = within(screen.getByTestId('content-analytics-stubs')).getAllByRole('row');
    expect(within(stubRows[1]).getAllByRole('cell').slice(1).map((cell) => cell.textContent)).toEqual(['12', '9']);
    const stubLinks = within(stubRows[1]).getAllByRole('link');
    expect(stubLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/article-2',
      '/admin/articles/2/analytics?from=2026-10-22&to=2026-11-20',
      '/admin/articles/2/edit',
    ]);

    const blockCells = within(within(screen.getByTestId('content-analytics-uncovered')).getAllByRole('row')[1]).getAllByRole('cell');
    expect(blockCells.slice(1).map((cell) => cell.textContent)).toEqual(['Блок 2, мнений: 2', 'Маликитский, Ханбалитский', '7', '40']);

    expect(within(screen.getByTestId('content-analytics-stale')).getByText('Старая')).toBeTruthy();
    expect(screen.getByText('Не сохранялись больше 365 дн.')).toBeTruthy();
    expect(screen.getByTestId('content-analytics-without-views')).toBeTruthy();
  });

  it('given empty lists, when shown, then says so instead of empty tables', async () => {
    const empty = { total: 0, items: [] };
    fetchAnalytics.mockResolvedValue({
      ...analytics,
      articlesWithoutViews: empty,
      stubsWithTraffic: empty,
      uncoveredBlocks: empty,
      staleArticles: empty,
    });

    renderSection();

    expect(await screen.findByText('За этот период заглушки никто не открывал.')).toBeTruthy();
    expect(screen.getByText('В каждом блоке мнений есть мнение каждой канонической школы.')).toBeTruthy();
    expect(screen.getByText('Устаревших статей нет.')).toBeTruthy();
    expect(screen.getByText('Все статьи, опубликованные до начала периода, за период открывали.')).toBeTruthy();
    expect(screen.queryByTestId('content-analytics-stubs')).toBeNull();
  });

  it('given another period chosen, when clicked, then asks for that many days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderSection();
    await screen.findByTestId('content-analytics-stubs');
    fireEvent.click(screen.getByRole('button', { name: '90 дн.' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith({ days: 90 });
  });

  it('given the request fails, when shown, then says so', async () => {
    fetchAnalytics.mockRejectedValue(new Error('boom'));

    renderSection();

    expect(await screen.findByText('Не удалось загрузить статистику.')).toBeTruthy();
  });
});
