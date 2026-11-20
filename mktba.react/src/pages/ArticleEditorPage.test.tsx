import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { LocalizationProvider } from '../localization/provider';
import { createArticleContent, getArticleContentById, updateArticleContent } from '../services/Article/articleService';
import type { ArticleContentDto } from '../shared/types/ApiTypes';
import ArticleEditorPage from './ArticleEditorPage';

vi.mock('../services/Article/articleService', () => ({
  createArticleContent: vi.fn(),
  getArticleContentById: vi.fn(),
  updateArticleContent: vi.fn(),
}));
vi.mock('../services/adminService', () => ({
  changeArticleStatus: vi.fn(),
  deleteArticle: vi.fn(),
  getAiProviderSettings: vi.fn(),
  getArticleById: vi.fn(async () => ({ id: 7, title: 'Намаз', status: 'Draft', allowedTransitions: [] })),
  styleMarkdownWithAi: vi.fn(),
}));
vi.mock('../services/schoolService', () => ({
  createCustomSchool: vi.fn(),
  deleteCustomSchool: vi.fn(),
  getSchoolsByArticleId: vi.fn(async () => []),
  getSystemSchools: vi.fn(async () => []),
}));

const article: ArticleContentDto = {
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  locale: 'ru',
  tags: [],
  paragraphs: [{ id: 11, order: 1, opinions: [{ id: 21, content: 'Текст статьи', isDefault: true, schoolIds: [], sources: [] }] }],
};

const renderAt = (url: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE], []);

  // A data router, as in the app: the unsaved-edits guard needs one.
  const router = createMemoryRouter(
    [
      { path: '/admin/articles/new', element: <ArticleEditorPage /> },
      { path: '/admin/articles/:articleId/edit', element: <ArticleEditorPage /> },
      { path: '/admin/articles/:articleId/history', element: <p>history-page</p> },
      { path: '/:slug', element: <p>article-page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <RouterProvider router={router} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return router;
};

const titleField = () => screen.getByPlaceholderText('Название статьи...') as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

describe('ArticleEditorPage', () => {
  beforeEach(() => {
    vi.mocked(createArticleContent).mockReset();
    vi.mocked(updateArticleContent).mockReset();
    vi.mocked(getArticleContentById).mockReset();
  });

  it('given the create address, when rendered, then the editor is empty and offers nothing that needs a saved article', () => {
    renderAt('/admin/articles/new');

    expect(titleField().value).toBe('');
    expect(screen.queryByText('История правок')).toBeNull();
    expect(screen.queryByLabelText('Комментарий к правке')).toBeNull();
  });

  it('given the create address and no title, when saved, then the save is refused with the reason', () => {
    renderAt('/admin/articles/new');

    save();

    expect(screen.getByText('Укажите заголовок статьи')).toBeTruthy();
    expect(createArticleContent).not.toHaveBeenCalled();
  });

  it('given the edit address, when the article loads, then the editor holds it with its history link and revision comment', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');

    expect(await screen.findByDisplayValue('Намаз')).toBeTruthy();
    expect(screen.getByDisplayValue('Текст статьи')).toBeTruthy();
    expect(screen.getByText('История правок').getAttribute('href')).toBe('/admin/articles/7/history');
    expect(screen.getByLabelText('Комментарий к правке')).toBeTruthy();
  });

  it('given an edited article, when saved, then the whole content is sent with the comment and the reader page opens', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });
    fireEvent.change(screen.getByLabelText('Комментарий к правке'), { target: { value: 'Заголовок' } });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(updateArticleContent).toHaveBeenCalledWith(7, expect.objectContaining({
      id: 7,
      title: 'Намаз путника',
      slug: 'namaz',
      editComment: 'Заголовок',
    }));
  });

  it('given an untouched article, when the history link is followed, then it opens without asking', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    await screen.findByDisplayValue('Намаз');

    fireEvent.click(screen.getByText('История правок'));

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given unsaved edits, when the history link is followed, then the editor asks and staying keeps the edits', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    fireEvent.click(screen.getByText('История правок'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Уйти без сохранения?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Остаться' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(titleField().value).toBe('Намаз путника');
    expect(screen.queryByText('history-page')).toBeNull();
  });

  it('given unsaved edits, when the user chooses to leave, then the history page opens', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    fireEvent.click(screen.getByText('История правок'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Уйти без сохранения' }));

    expect(await screen.findByText('history-page')).toBeTruthy();
  });

  it('given a new article, when it is saved, then its page opens without asking', async () => {
    vi.mocked(createArticleContent).mockResolvedValue({ ...article, id: 8, slug: 'novaya' });
    renderAt('/admin/articles/new');
    fireEvent.change(titleField(), { target: { value: 'Новая' } });
    fireEvent.change(screen.getByPlaceholderText('Введите текст параграфа...'), { target: { value: 'Текст' } });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('given an article that cannot be loaded, when the edit address opens, then the load error is shown', async () => {
    vi.mocked(getArticleContentById).mockRejectedValue(new Error('404'));
    renderAt('/admin/articles/7/edit');

    await waitFor(() => expect(screen.getByText('Не удалось загрузить статью')).toBeTruthy());
  });
});
