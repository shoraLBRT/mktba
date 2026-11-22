import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleSummary } from '../../services/adminService';
import AdminDashboardPage from './AdminDashboardPage';

vi.mock('../../services/adminService', () => ({
  getArticleSummary: vi.fn(),
}));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <AdminDashboardPage />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.mocked(getArticleSummary).mockReset();
});

describe('AdminDashboardPage', () => {
  it('given the summary from the API, when shown, then gives its counters, shares and status counts', async () => {
    vi.mocked(getArticleSummary).mockResolvedValue({
      total: 8,
      withContent: 6,
      empty: 2,
      byStatus: { draft: 3, inReview: 1, published: 4, archived: 0 },
    });

    renderPage();

    const total = (await screen.findByText('Всего статей')).parentElement!;
    expect(await within(total).findByText('8')).toBeTruthy();
    const withContent = screen.getByText('С контентом').parentElement!;
    expect(within(withContent).getByText('6')).toBeTruthy();
    expect(within(withContent).getByText('75%')).toBeTruthy();
    const empty = screen.getByText('Пустые (заглушки)').parentElement!;
    expect(within(empty).getByText('2')).toBeTruthy();
    expect(within(empty).getByText('25%')).toBeTruthy();
    const counts = within(screen.getByTestId('article-status-breakdown'))
      .getAllByText(/^\d+$/)
      .map((node) => node.textContent);
    expect(counts).toEqual(['3', '1', '4', '0']);
    expect(getArticleSummary).toHaveBeenCalledTimes(1);
  });
});
