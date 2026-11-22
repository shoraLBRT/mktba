import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roleAllows } from '../../auth/roleAccess';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleSummary } from '../../services/adminService';
import type { UserRole } from '../../shared/types/ApiTypes';
import AdminDashboardPage from './AdminDashboardPage';

vi.mock('../../services/adminService', () => ({
  getArticleSummary: vi.fn(),
}));
vi.mock('../../auth/useCurrentUser', () => ({ useCurrentUser: vi.fn() }));
vi.mock('./SiteAnalyticsSection', () => ({ SiteAnalyticsSection: () => <div data-testid="site-analytics" /> }));
vi.mock('./SearchAnalyticsSection', () => ({ SearchAnalyticsSection: () => <div data-testid="search-analytics" /> }));
vi.mock('./AuthorAnalyticsSection', () => ({ AuthorAnalyticsSection: () => <div data-testid="author-analytics" /> }));

const signInAs = (role: UserRole) =>
  vi.mocked(useCurrentUser).mockReturnValue({ user: undefined, role, can: (policy) => roleAllows(role, policy) });
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
    signInAs('Author');
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

  it('given an admin, when shown, then adds the site statistics', async () => {
    signInAs('Admin');
    vi.mocked(getArticleSummary).mockResolvedValue({ total: 0, withContent: 0, empty: 0, byStatus: { draft: 0, inReview: 0, published: 0, archived: 0 } });

    renderPage();

    expect(await screen.findByTestId('site-analytics')).toBeTruthy();
    expect(screen.getByTestId('search-analytics')).toBeTruthy();
    expect(screen.getByTestId('author-analytics')).toBeTruthy();
  });

  it('given an author, when shown, then gives their own statistics but leaves the site statistics out', async () => {
    signInAs('Author');
    vi.mocked(getArticleSummary).mockResolvedValue({ total: 0, withContent: 0, empty: 0, byStatus: { draft: 0, inReview: 0, published: 0, archived: 0 } });

    renderPage();

    expect(await screen.findByText('Всего статей')).toBeTruthy();
    expect(screen.getByTestId('author-analytics')).toBeTruthy();
    expect(screen.queryByTestId('site-analytics')).toBeNull();
    expect(screen.queryByTestId('search-analytics')).toBeNull();
  });
});
