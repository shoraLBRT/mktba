import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getTags, mergeTag, renameTag } from '../../services/tagService';
import { ApiError, translateApiError } from '../../shared/api-client/apiError';
import type { TagDto } from '../../shared/types/ApiTypes';
import AdminTagsPage from './AdminTagsPage';

vi.mock('../../services/tagService', () => ({ getTags: vi.fn(), renameTag: vi.fn(), mergeTag: vi.fn() }));

const fiqh: TagDto = { id: 1, locale: 'ru', name: 'Фикх', slug: 'fikkh', articleCount: 3 };
const fiqhTypo: TagDto = { id: 2, locale: 'ru', name: 'Фиких', slug: 'fikikh', articleCount: 1 };
const english: TagDto = { id: 3, locale: 'en', name: 'Fiqh', slug: 'fiqh', articleCount: 1 };

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminTagsPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(getTags).mockReset();
  vi.mocked(renameTag).mockReset();
  vi.mocked(mergeTag).mockReset();
});

describe('AdminTagsPage', () => {
  it('given tags, when shown, then each links to its page and merges only into tags of its language', async () => {
    vi.mocked(getTags).mockResolvedValue([english, fiqh, fiqhTypo]);
    renderPage();

    const row = await screen.findByTestId('tag-row-1');
    expect(within(row).getByRole('link', { name: 'Фикх' }).getAttribute('href')).toBe('/tags/fikkh');
    expect(row.textContent).toContain('статей: 3');
    const options = within(within(row).getByLabelText('Объединить с тегом')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Выберите тег', 'Фиких']);
    expect(within(screen.getByTestId('tag-row-3')).queryByLabelText('Объединить с тегом')).toBeNull();
  });

  it('given a new name, when saved, then renames and keeps the slug unless it was changed', async () => {
    vi.mocked(getTags).mockResolvedValue([fiqh]);
    vi.mocked(renameTag).mockResolvedValue({ ...fiqh, name: 'Исламское право' });
    renderPage();

    const row = await screen.findByTestId('tag-row-1');
    fireEvent.change(within(row).getByLabelText('Название'), { target: { value: 'Исламское право' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(renameTag).toHaveBeenCalledWith(1, { name: 'Исламское право', slug: null }));
    expect(await screen.findByText('Тег сохранён: «Исламское право».')).toBeTruthy();
  });

  it('given a refused rename, when saved, then shows the translated error', async () => {
    vi.mocked(getTags).mockResolvedValue([fiqh, fiqhTypo]);
    vi.mocked(renameTag).mockRejectedValue(new ApiError(translateApiError('tag_name_taken'), 400, 'tag_name_taken'));
    renderPage();

    const row = await screen.findByTestId('tag-row-2');
    fireEvent.change(within(row).getByLabelText('Название'), { target: { value: 'фикх' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Тег с таким названием уже есть. Объедините их.')).toBeTruthy();
  });

  it('given a confirmed merge, when clicked, then merges into the chosen tag', async () => {
    vi.mocked(getTags).mockResolvedValue([fiqh, fiqhTypo]);
    vi.mocked(mergeTag).mockResolvedValue({ ...fiqh, articleCount: 4 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    const row = await screen.findByTestId('tag-row-2');
    const merge = within(row).getByRole('button', { name: 'Объединить' });
    expect((merge as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(row).getByLabelText('Объединить с тегом'), { target: { value: '1' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Объединить' }));

    expect(confirm).toHaveBeenCalledWith('Перенести статьи с тега «Фиких» на «Фикх» и удалить «Фиких»?');
    await waitFor(() => expect(mergeTag).toHaveBeenCalledWith(2, { intoTagId: 1 }));
    expect(await screen.findByText('Теги объединены в «Фикх».')).toBeTruthy();
  });
});
