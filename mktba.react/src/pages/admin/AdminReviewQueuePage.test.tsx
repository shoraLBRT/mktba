import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getReviewQueue } from '../../services/adminService';
import AdminReviewQueuePage from './AdminReviewQueuePage';

vi.mock('../../services/adminService', () => ({ getReviewQueue: vi.fn() }));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminReviewQueuePage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.mocked(getReviewQueue).mockReset();
});

describe('AdminReviewQueuePage', () => {
  it('given articles in review, when shown, then each names its author and links to its review', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([
      { id: 7, title: 'Намаз', slug: 'namaz', locale: 'ru', authorId: 2, authorDisplayName: 'Автор', submittedAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T09:00:00Z', publishedAt: null, latestRevisionNumber: 2, publishedRevisionNumber: null },
      { id: 8, title: 'Закят', slug: 'zakyat', locale: 'ru', authorId: null, authorDisplayName: null, submittedAt: null, updatedAt: '2026-11-19T09:00:00Z', publishedAt: '2026-11-01T09:00:00Z', latestRevisionNumber: 5, publishedRevisionNumber: 4 },
    ]);

    renderPage();

    const first = await screen.findByTestId('review-item-7');
    expect(first.textContent).toContain('Автор: Автор');
    expect(first.textContent).toContain('Новая статья');
    expect(within(first).getByRole('link', { name: 'Проверить' }).getAttribute('href')).toBe('/admin/review/7');
    const second = screen.getByTestId('review-item-8');
    expect(second.textContent).toContain('Автор не указан');
    expect(second.textContent).toContain('Была опубликована (ревизия 4)');
  });

  it('given an empty queue, when shown, then says so', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Очередь пуста: на проверке нет ни одной статьи.')).toBeTruthy();
  });
});
