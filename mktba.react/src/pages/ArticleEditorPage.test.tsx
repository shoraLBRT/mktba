import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { LocalizationProvider } from '../localization/provider';
import { createArticleContent, getArticleContentById, updateArticleContent } from '../services/Article/articleService';
import type { ArticleContentDto, NavigationArticleDto } from '../shared/types/ApiTypes';
import { localDraftCopyKey, readLocalDraftCopy, writeLocalDraftCopy } from './add-article/localDraftCopy';
import { articleDraftFromDto } from './add-article/articleDraft';
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
vi.mock('../auth/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 1, email: 'author@example.com', role: 'Author' }, role: undefined, can: () => false }),
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

const renderAt = (url: string, navigationTree: NavigationArticleDto[] = []) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE], navigationTree);

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
    window.localStorage.clear();
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

  it('given an edit, when typing pauses, then a copy is kept in the browser and the indicator says so', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    expect(await screen.findByText('Все изменения сохранены')).toBeTruthy();

    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    expect(await screen.findByText(/Копия правок сохранена в этом браузере/, undefined, { timeout: 3000 })).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))?.draft.title).toBe('Намаз путника');
  });

  it('given an edit, when the article is saved, then no copy is left behind', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    vi.mocked(updateArticleContent).mockResolvedValue();
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    save();

    expect(await screen.findByText('article-page')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given a copy left by an earlier visit to an article saved since, when the editor opens, then it is offered with a warning and restored on request', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue({ ...article, updatedAt: '2026-11-21T12:00:00Z' });
    writeLocalDraftCopy(localDraftCopyKey(1, 7), {
      savedAt: '2026-11-21T10:00:00Z',
      baseUpdatedAt: '2026-11-20T09:00:00Z',
      draft: { ...articleDraftFromDto(article), title: 'Намаз из копии' },
    });
    renderAt('/admin/articles/7/edit');

    const offer = await screen.findByRole('region', { name: 'Найдены несохранённые правки' });
    expect(within(offer).getByText(/Статья с тех пор была сохранена ещё раз/)).toBeTruthy();
    expect(screen.getByDisplayValue('Намаз')).toBeTruthy();

    fireEvent.click(within(offer).getByRole('button', { name: 'Восстановить' }));

    expect(screen.getByDisplayValue('Намаз из копии')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Найдены несохранённые правки' })).toBeNull();
  });

  it('given an offered copy, when it is discarded, then the article stays as loaded and the copy is gone', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    writeLocalDraftCopy(localDraftCopyKey(1, 7), {
      savedAt: '2026-11-21T10:00:00Z',
      baseUpdatedAt: null,
      draft: { ...articleDraftFromDto(article), title: 'Намаз из копии' },
    });
    renderAt('/admin/articles/7/edit');

    const offer = await screen.findByRole('region', { name: 'Найдены несохранённые правки' });
    expect(within(offer).queryByText(/Статья с тех пор была сохранена ещё раз/)).toBeNull();
    fireEvent.click(within(offer).getByRole('button', { name: 'Отбросить' }));

    expect(screen.getByDisplayValue('Намаз')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given unsaved edits, when the user leaves without saving, then their copy is dropped too', async () => {
    vi.mocked(getArticleContentById).mockResolvedValue(article);
    renderAt('/admin/articles/7/edit');
    fireEvent.change(await screen.findByDisplayValue('Намаз'), { target: { value: 'Намаз путника' } });

    fireEvent.click(screen.getByText('История правок'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Уйти без сохранения' }));

    expect(await screen.findByText('history-page')).toBeTruthy();
    expect(readLocalDraftCopy(localDraftCopyKey(1, 7))).toBeNull();
  });

  it('given a picked article, when the link is inserted, then the text and its caret are back at once and stay where the user moves them', async () => {
    const target: NavigationArticleDto = { id: 9, title: 'Пост', slug: 'post', status: 'Published', hasContent: true, canEdit: true };
    renderAt('/admin/articles/new', [target]);
    const text = screen.getByPlaceholderText('Введите текст параграфа...') as HTMLTextAreaElement;
    fireEvent.focus(text);
    fireEvent.change(text, { target: { value: 'См. ' } });
    text.setSelectionRange(4, 4);

    fireEvent.click(screen.getByRole('button', { name: 'Ссылка на статью' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ссылка на статью' })).getByRole('button', { name: /Пост/ }));

    // No frame has passed: the insert, the focus and the selected link text are already there.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(text.value).toBe('См. [Пост](/post)');
    expect(document.activeElement).toBe(text);
    expect([text.selectionStart, text.selectionEnd]).toEqual([5, 9]);

    // The user moves the caret right away; nothing restores the old selection over it later.
    text.setSelectionRange(text.value.length, text.value.length);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect([text.selectionStart, text.selectionEnd]).toEqual([17, 17]);
  });

  it('given an article that cannot be loaded, when the edit address opens, then the load error is shown', async () => {
    vi.mocked(getArticleContentById).mockRejectedValue(new Error('404'));
    renderAt('/admin/articles/7/edit');

    await waitFor(() => expect(screen.getByText('Не удалось загрузить статью')).toBeTruthy());
  });
});
