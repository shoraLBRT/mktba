import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleAuthors, getUsers, setArticleAuthors } from '../../services/adminService';
import { ApiError } from '../../shared/api-client/apiError';
import { ArticleAuthorsPanel } from './ArticleAuthorsPanel';

vi.mock('../../services/adminService', () => ({
  getUsers: vi.fn(),
  getArticleAuthors: vi.fn(),
  setArticleAuthors: vi.fn(),
}));

const fetchUsers = vi.mocked(getUsers);
const fetchAuthors = vi.mocked(getArticleAuthors);
const saveAuthors = vi.mocked(setArticleAuthors);

const users = [
  { id: 1, email: 'author@mktba.ru', role: 'Author' as const },
  { id: 2, email: 'second@mktba.ru', role: 'Author' as const },
  { id: 3, email: 'third@mktba.ru', role: 'Author' as const },
];

const renderPanel = (onSaved = vi.fn(), onError = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <ArticleAuthorsPanel articleId={7} onSaved={onSaved} onError={onError} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return { onSaved, onError };
};

describe('ArticleAuthorsPanel', () => {
  beforeEach(() => {
    fetchUsers.mockReset().mockResolvedValue(users);
    fetchAuthors.mockReset().mockResolvedValue({ authorId: 1, coAuthorIds: [2] });
    saveAuthors.mockReset();
  });

  it('given an author and a co-author, when rendered, then selects them and does not offer the author as co-author', async () => {
    renderPanel();

    expect(((await screen.findByLabelText('Автор')) as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('second@mktba.ru') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('third@mktba.ru') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('author@mktba.ru')).toBeNull();
  });

  it('given a new co-author ticked, when saved, then sends the author and both co-authors', async () => {
    saveAuthors.mockResolvedValue({ authorId: 1, coAuthorIds: [2, 3] });
    const { onSaved } = renderPanel();

    fireEvent.click(await screen.findByLabelText('third@mktba.ru'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить авторов' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveAuthors).toHaveBeenCalledWith(7, { authorId: 1, coAuthorIds: [2, 3] });
  });

  it('given a co-author promoted to author, when saved, then drops them from the co-authors', async () => {
    saveAuthors.mockResolvedValue({ authorId: 2, coAuthorIds: [] });
    renderPanel();

    fireEvent.change(await screen.findByLabelText('Автор'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить авторов' }));

    await waitFor(() => expect(saveAuthors).toHaveBeenCalledWith(7, { authorId: 2, coAuthorIds: [] }));
  });

  it('given the API rejects the change, when saved, then reports the error', async () => {
    saveAuthors.mockRejectedValue(new ApiError('Пользователь не найден.'));
    const { onError, onSaved } = renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить авторов' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Не удалось сохранить авторов: Пользователь не найден.'));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
