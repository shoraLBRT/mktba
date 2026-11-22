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
  previous: { from: '2026-11-17', to: '2026-11-18', totals: { articleViews: 6, visitors: 7, searches: 0 } },
  webVitals: [
    { metric: 'WebVitalLcp', samples: 4, p75: 3120.4, good: 2, needsImprovement: 1, poor: 1 },
    { metric: 'WebVitalInp', samples: 2, p75: 150, good: 2, needsImprovement: 0, poor: 0 },
    { metric: 'WebVitalCls', samples: 0, p75: null, good: 0, needsImprovement: 0, poor: 0 },
  ],
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
    expect(fetchAnalytics).toHaveBeenCalledWith({ days: 30 });

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

    const lcp = screen.getByTestId('web-vital-WebVitalLcp');
    expect(lcp.textContent).toContain('3120 мс (требует улучшения)');
    expect(lcp.textContent).toContain('50% · 25% · 25%');
    expect(screen.getByTestId('web-vital-WebVitalInp').textContent).toContain('150 мс (хорошо)');
    expect(screen.getByTestId('web-vital-WebVitalCls').textContent).toContain('нет замеров');
  });

  it('given another period chosen, when clicked, then asks for that many days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();
    await screen.findByTestId('site-analytics-views');

    fireEvent.click(screen.getByRole('button', { name: '7 дн.' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith({ days: 7 });
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

  it('given the previous period, when shown, then gives each total its change and the dates compared with', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();

    expect((await screen.findByTestId('site-analytics-views-change')).textContent).toBe('+100% к предыдущему (6)');
    expect(screen.getByTestId('site-analytics-visitors-change').textContent).toBe('Как в предыдущем периоде');
    expect(screen.getByTestId('site-analytics-searches-change').textContent).toBe('В предыдущем периоде — 0');
    expect(screen.getByTestId('site-analytics-comparison').textContent).toMatch(/^Сравнение с предыдущим периодом той же длины: 17 нояб.* — 18 нояб/);
  });

  it('given a range picked by hand, when applied, then asks for those days, and refuses a reversed range', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();
    await screen.findByTestId('site-analytics-views');

    fireEvent.click(screen.getByRole('button', { name: 'Свой период' }));
    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert').textContent).toBe('Начало периода должно быть не позже конца.');
    expect((screen.getByRole('button', { name: 'Показать' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));

    expect(fetchAnalytics).toHaveBeenLastCalledWith({ from: '2026-10-10', to: '2026-10-20' });
    expect(screen.getByRole('button', { name: 'Свой период' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('given a filter, when typed, then narrows the top articles; each opens its statistics over the same days', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    renderSection();
    const top = await screen.findByTestId('site-analytics-top-articles');

    expect(within(top).getByRole('link', { name: 'Статистика' }).getAttribute('href')).toBe(
      '/admin/articles/1/analytics?from=2026-11-19&to=2026-11-20',
    );

    fireEvent.change(screen.getByTestId('site-analytics-filter'), { target: { value: 'нама' } });
    expect(within(screen.getByTestId('site-analytics-top-articles')).getAllByRole('row')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('site-analytics-filter'), { target: { value: 'зякат' } });
    expect(screen.queryByTestId('site-analytics-top-articles')).toBeNull();
    expect(screen.getByText('Под фильтр ничего не подходит.')).toBeTruthy();
  });

  it('given the CSV button of the daily table, when pressed, then hands the browser its rows', async () => {
    fetchAnalytics.mockResolvedValue(analytics);
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:csv';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderSection();
    await screen.findByTestId('site-analytics-views');

    fireEvent.click(screen.getByRole('button', { name: 'Скачать CSV: По дням' }));

    expect(click).toHaveBeenCalledTimes(1);
    const text = await blobs[0].text();
    expect(text).toContain('День,Просмотры статей,Посетители,Поиски\r\n2026-11-19,7,3,2\r\n2026-11-20,5,4,1\r\n');
    click.mockRestore();
  });

  it('given the request fails, when shown, then says so', async () => {
    fetchAnalytics.mockRejectedValue(new Error('boom'));

    renderSection();

    expect(await screen.findByText('Не удалось загрузить статистику.')).toBeTruthy();
  });
});
