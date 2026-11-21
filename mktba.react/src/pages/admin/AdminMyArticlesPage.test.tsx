import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { changeArticleStatus, getMyArticles } from '../../services/adminService';
import type { ArticleListItemDto } from '../../shared/types/ApiTypes';
import AdminMyArticlesPage from './AdminMyArticlesPage';

vi.mock('../../services/adminService', () => ({
  getMyArticles: vi.fn(),
  changeArticleStatus: vi.fn(),
  MY_ARTICLES_PAGE_SIZE: 20,
}));

const item = (overrides: Partial<ArticleListItemDto>): ArticleListItemDto => ({
  id: 1,
  title: 'Статья',
  slug: 'statya',
  locale: 'ru',
  status: 'Draft',
  allowedTransitions: [],
  parentArticleId: null,
  authorId: 2,
  tags: [],
  paragraphCount: 1,
  canEdit: true,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-20T09:00:00Z',
  publishedAt: null,
  lastStatusChange: undefined,
  ...overrides,
});

const renderPage = (url = '/admin/my-articles') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[url]}>
          <AdminMyArticlesPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.mocked(getMyArticles).mockReset();
  vi.mocked(changeArticleStatus).mockReset();
});

describe('AdminMyArticlesPage', () => {
  it('given a returned draft and a published article, when shown, then gives the comment and the quick actions', async () => {
    vi.mocked(getMyArticles).mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: 20,
      items: [
        item({
          id: 7,
          title: 'Намаз',
          allowedTransitions: ['InReview'],
          lastStatusChange: { fromStatus: 'InReview', toStatus: 'Draft', changedAt: '2026-11-20T10:00:00Z', changedByDisplayName: 'Модератор', comment: 'Добавьте источники.' },
        }),
        item({ id: 8, title: 'Закят', slug: 'zakyat', status: 'Published', allowedTransitions: ['Archived'] }),
      ],
    });
    vi.mocked(changeArticleStatus).mockResolvedValue({} as never);

    renderPage();

    const draft = await screen.findByTestId('my-article-7');
    expect(within(draft).getByTestId('returned-for-revision').textContent).toContain('Добавьте источники.');
    expect(within(draft).getByRole('link', { name: 'Редактировать' }).getAttribute('href')).toBe('/admin/articles/7/edit');
    expect(within(draft).queryByRole('link', { name: 'На сайте' })).toBeNull();
    const published = screen.getByTestId('my-article-8');
    expect(within(published).getByRole('link', { name: 'На сайте' }).getAttribute('href')).toBe('/zakyat');
    expect(within(published).queryByRole('button')).toBeNull();

    fireEvent.click(within(draft).getByRole('button', { name: 'Отправить на проверку' }));

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'InReview'));
    expect(getMyArticles).toHaveBeenCalledWith(null, 1);
  });

  it('given a status in the address, when shown, then asks for that status only and marks its tab', async () => {
    vi.mocked(getMyArticles).mockResolvedValue({ total: 0, page: 1, pageSize: 20, items: [] });

    renderPage('/admin/my-articles?status=InReview');

    expect(await screen.findByText('Здесь пока нет ваших статей.')).toBeTruthy();
    expect(getMyArticles).toHaveBeenCalledWith('InReview', 1);
    expect(screen.getByRole('link', { name: 'На проверке' }).getAttribute('aria-current')).toBe('page');
  });
});
