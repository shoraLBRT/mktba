import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleTrash, purgeArticle, restoreArticleFromTrash } from '../../services/Article/trashService';
import type { ArticleTrashItemDto } from '../../shared/types/ApiTypes';
import AdminTrashPage from './AdminTrashPage';

vi.mock('../../services/Article/trashService', () => ({
  getArticleTrash: vi.fn(),
  restoreArticleFromTrash: vi.fn(),
  purgeArticle: vi.fn(),
  TRASH_QUERY_KEY: ['adminTrash'],
}));

const trashed = (id: number, title: string, patch: Partial<ArticleTrashItemDto> = {}): ArticleTrashItemDto => ({
  id,
  title,
  slug: `article-${id}`,
  locale: 'ru',
  status: 'Published',
  deletedAt: '2026-11-22T10:00:00Z',
  deletedByDisplayName: 'Админ',
  parentArticleId: null,
  parentTitle: null,
  parentInTrash: false,
  ...patch,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminTrashPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(getArticleTrash).mockReset();
  vi.mocked(restoreArticleFromTrash).mockReset();
  vi.mocked(purgeArticle).mockReset();
});

describe('AdminTrashPage', () => {
  it('given an empty trash, when opened, then says so', async () => {
    vi.mocked(getArticleTrash).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Корзина пуста.')).toBeTruthy();
  });

  it('given trashed articles, when shown, then lists where each goes back and blocks the one whose section is trashed', async () => {
    vi.mocked(getArticleTrash).mockResolvedValue([
      trashed(1, 'Намаз'),
      trashed(2, 'Сухое омовение', { parentArticleId: 3, parentTitle: 'Таяммум', parentInTrash: true }),
    ]);
    renderPage();

    const first = await screen.findByTestId('trash-row-1');
    expect(first.textContent).toContain('Корень');
    expect(first.textContent).toContain('Админ');
    expect((within(first).getByRole('button', { name: 'Вернуть' }) as HTMLButtonElement).disabled).toBe(false);
    const second = screen.getByTestId('trash-row-2');
    expect(second.textContent).toContain('Таяммум (тоже в корзине)');
    expect((within(second).getByRole('button', { name: 'Вернуть' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('given a trashed article, when restored, then restores it and says so', async () => {
    vi.mocked(getArticleTrash).mockResolvedValue([trashed(1, 'Намаз')]);
    vi.mocked(restoreArticleFromTrash).mockResolvedValue();
    renderPage();

    fireEvent.click(within(await screen.findByTestId('trash-row-1')).getByRole('button', { name: 'Вернуть' }));

    await waitFor(() => expect(restoreArticleFromTrash).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Статья «Намаз» возвращена.')).toBeTruthy();
  });

  it('given a purge, when not confirmed, then nothing is deleted; when confirmed, then it is', async () => {
    vi.mocked(getArticleTrash).mockResolvedValue([trashed(1, 'Намаз')]);
    vi.mocked(purgeArticle).mockResolvedValue();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    const row = await screen.findByTestId('trash-row-1');

    fireEvent.click(within(row).getByRole('button', { name: 'Удалить навсегда' }));
    expect(purgeArticle).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'Удалить навсегда' }));

    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('«Намаз» навсегда'));
    await waitFor(() => expect(purgeArticle).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Статья «Намаз» удалена навсегда.')).toBeTruthy();
  });
});
