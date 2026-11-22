import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArticleAnalytics } from '../../services/adminService';
import type { ArticleAnalyticsDto } from '../../shared/types/ApiTypes';
import { LocalizationProvider } from '../../localization/provider';
import AdminArticleAnalyticsPage from './AdminArticleAnalyticsPage';

vi.mock('../../services/adminService', () => ({ getArticleAnalytics: vi.fn() }));

const fetchAnalytics = vi.mocked(getArticleAnalytics);

const renderPage = (path = '/admin/articles/7/analytics') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/articles/:articleId/analytics" element={<AdminArticleAnalyticsPage />} />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const analytics: ArticleAnalyticsDto = {
  articleId: 7,
  title: 'Намаз',
  slug: 'namaz',
  days: 2,
  from: '2026-11-19',
  to: '2026-11-20',
  totals: { views: 10, readers: 5, opinionsShown: 6, opinionSwitches: 3, internalLinkClicks: 2 },
  daily: [
    { day: '2026-11-19', views: 6, readers: 3, opinionSwitches: 2, internalLinkClicks: 1 },
    { day: '2026-11-20', views: 4, readers: 2, opinionSwitches: 1, internalLinkClicks: 1 },
  ],
  depth: { views: 10, reachedDepth25: 10, reachedDepth50: 8, reachedDepth75: 6, reachedDepth100: 4 },
  schools: [{ schoolId: 3, name: 'Ханафитский', views: 4, readers: 3 }],
  viewsWithoutSchool: 6,
  aggregatedAtUtc: '2026-11-20T14:00:00Z',
  previous: { from: '2026-11-17', to: '2026-11-18', totals: { views: 5, readers: 5, opinionsShown: 0, opinionSwitches: 0, internalLinkClicks: 4 } },
};

const httpError = (status: number) =>
  new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {},
  });

describe('AdminArticleAnalyticsPage', () => {
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it('shows the article totals, daily chart, depth and mazhabs', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Намаз' })).toBeTruthy();
    expect(fetchAnalytics).toHaveBeenCalledWith(7, { days: 30 });
    expect(within(screen.getByTestId('article-analytics-views')).getByText('10')).toBeTruthy();
    expect(within(screen.getByTestId('article-analytics-finished')).getByText('40%')).toBeTruthy();
    expect(within(screen.getByTestId('article-analytics-switches')).getByText('3')).toBeTruthy();
    expect(within(screen.getByTestId('article-analytics-clicks')).getByText('2')).toBeTruthy();
    expect(screen.getAllByTestId('article-analytics-day')).toHaveLength(2);
    expect(within(screen.getByTestId('article-analytics-schools')).getByText('Ханафитский')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Открыть на сайте' }).getAttribute('href')).toBe('/namaz');
    expect(screen.getByRole('link', { name: 'Редактировать' }).getAttribute('href')).toBe('/admin/articles/7/edit');
  });

  it('asks again for another period', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Намаз' });

    fireEvent.click(screen.getByRole('button', { name: /7/ }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith(7, { days: 7 });
  });

  it('opened from a dashboard, shows the same days and compares them with the days before', async () => {
    fetchAnalytics.mockResolvedValue(analytics);

    renderPage('/admin/articles/7/analytics?from=2026-10-01&to=2026-10-31');

    expect((await screen.findByTestId('article-analytics-views-change')).textContent).toBe('+100% к предыдущему (5)');
    expect(fetchAnalytics).toHaveBeenCalledWith(7, { from: '2026-10-01', to: '2026-10-31' });
    expect(screen.getByRole('button', { name: 'Свой период' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('С') as HTMLInputElement).value).toBe('2026-10-01');
    expect(screen.getByTestId('article-analytics-clicks-change').textContent).toBe('−50% к предыдущему (4)');
  });

  it.each([403, 404])('says the statistics are unavailable on %i', async (status) => {
    fetchAnalytics.mockRejectedValue(httpError(status));

    renderPage();

    expect(await screen.findByTestId('article-analytics-unavailable')).toBeTruthy();
  });

  it('does not ask for an id that is not a number', () => {
    renderPage('/admin/articles/abc/analytics');

    expect(screen.getByTestId('article-analytics-unavailable')).toBeTruthy();
    expect(fetchAnalytics).not.toHaveBeenCalled();
  });
});
