import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { bulkChangeArticleStatus, getArticleList, getUsers } from '../../services/adminService';
import { moveArticleToTrash } from '../../services/Article/trashService';
import { ApiError, translateApiError } from '../../shared/api-client/apiError';
import type { ArticleListItemDto } from '../../shared/types/ApiTypes';
import AdminArticlesPage from './AdminArticlesPage';

vi.mock('../../services/adminService', () => ({
  getArticleList: vi.fn(),
  getUsers: vi.fn(),
  bulkChangeArticleStatus: vi.fn(),
}));
vi.mock('../../services/Article/trashService', () => ({ moveArticleToTrash: vi.fn(), TRASH_QUERY_KEY: ['adminTrash'] }));
vi.mock('../../auth/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 1, email: 'admin@mktba.test', role: 'Admin' }, role: 'Admin', can: () => true }),
}));

const fetchList = vi.mocked(getArticleList);
const bulkChange = vi.mocked(bulkChangeArticleStatus);

const item = (id: number, title: string, patch: Partial<ArticleListItemDto> = {}): ArticleListItemDto => ({
  id,
  title,
  slug: `article-${id}`,
  locale: 'ru',
  status: 'Draft',
  allowedTransitions: ['InReview'],
  parentArticleId: null,
  authorId: 1,
  tags: [],
  paragraphCount: 2,
  canEdit: true,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
  publishedAt: null,
  ...patch,
});

const CurrentSearch = () => <p data-testid="search">{useLocation().search}</p>;

const renderAt = (path = '/admin/articles') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[path]}>
          <AdminArticlesPage />
          <CurrentSearch />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

describe('AdminArticlesPage', () => {
  beforeEach(() => {
    fetchList.mockReset().mockResolvedValue({
      items: [item(1, 'Намаз', { tags: ['фикх'] }), item(2, 'Пост', { authorId: 5 })],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(getUsers).mockReset().mockResolvedValue([{ id: 5, email: 'author@mktba.test', role: 'Author' }]);
    bulkChange.mockReset();
  });

  it('given filters in the URL, when opened, then requests that page and shows the rows', async () => {
    renderAt('/admin/articles?status=Draft&sort=Title&dir=Asc&page=2');

    const table = await screen.findByRole('table', { name: 'Список статей' });
    expect(fetchList).toHaveBeenCalledWith(expect.objectContaining({ status: 'Draft', sort: 'Title', dir: 'Asc', page: 2 }));
    expect(within(table).getByRole('link', { name: 'Намаз' }).getAttribute('href')).toBe('/admin/articles/1/edit');
    expect(within(table).getByText('Вы')).toBeTruthy();
    expect(await within(table).findByText('author@mktba.test')).toBeTruthy();
  });

  it('given a page, when a filter changes, then writes it to the URL and returns to the first page', async () => {
    renderAt('/admin/articles?page=3');
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'Published' } });

    expect(screen.getByTestId('search').textContent).toBe('?status=Published');
  });

  it('given a sorted column, when its header is clicked again, then flips the direction', async () => {
    renderAt('/admin/articles?sort=Title&dir=Asc');
    await screen.findByRole('table');

    fireEvent.click(screen.getByRole('button', { name: 'Название' }));

    expect(screen.getByTestId('search').textContent).toBe('?sort=Title');
  });

  it('given two selected articles, when submitted in bulk, then confirms first and reports the one that was skipped', async () => {
    bulkChange.mockResolvedValue({
      results: [
        { id: 1, ok: true, code: null },
        { id: 2, ok: false, code: 'forbidden' },
      ],
    });
    renderAt();
    await screen.findByRole('table');

    fireEvent.click(screen.getByLabelText('Выбрать все статьи на странице'));
    const bar = screen.getByRole('region', { name: 'Действия с выбранными' });
    expect(within(bar).getByText('Выбрано: 2')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Отправить на проверку' }));
    expect(bulkChange).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Применить' }));

    await waitFor(() => expect(bulkChange).toHaveBeenCalledWith({ ids: [1, 2], status: 'InReview' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Статус изменён: 1 из 2.');
    expect(status.textContent).toContain('Пост');
    expect(screen.queryByRole('region', { name: 'Действия с выбранными' })).toBeNull();
  });

  it('given no matching articles, when opened, then says so', async () => {
    fetchList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    renderAt('/admin/articles?search=нет');

    expect(await screen.findByText('Статей с такими условиями нет.')).toBeTruthy();
    expect((screen.getByLabelText('Поиск') as HTMLInputElement).value).toBe('нет');
  });

  it('given a confirmed move to the trash, when clicked, then trashes that article and says so', async () => {
    vi.mocked(moveArticleToTrash).mockReset().mockResolvedValue();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt();
    const table = await screen.findByRole('table');

    fireEvent.click(within(table).getAllByRole('button', { name: 'В корзину' })[0]);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('«Намаз»'));
    await waitFor(() => expect(moveArticleToTrash).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Статья «Намаз» перемещена в корзину.')).toBeTruthy();
    confirm.mockRestore();
  });

  it('given a section with children, when moved to the trash, then shows the refusal', async () => {
    vi.mocked(moveArticleToTrash)
      .mockReset()
      .mockRejectedValue(new ApiError(translateApiError('article_has_children'), 400, 'article_has_children'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt();
    const table = await screen.findByRole('table');

    fireEvent.click(within(table).getAllByRole('button', { name: 'В корзину' })[1]);

    expect(await screen.findByText(/сначала перенесите или удалите их/)).toBeTruthy();
    confirm.mockRestore();
  });
});
