import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import {
  createArticleComment,
  deleteArticleComment,
  getArticleComments,
  reportArticleComment,
  updateArticleComment,
} from '../../services/commentService';
import type { ArticleCommentDto, ArticleCommentPageDto, ArticleCommentViewerDto } from '../../shared/types/ApiTypes';
import ArticleComments from './ArticleComments';

vi.mock('../../services/commentService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/commentService')>()),
  getArticleComments: vi.fn(),
  createArticleComment: vi.fn(),
  updateArticleComment: vi.fn(),
  deleteArticleComment: vi.fn(),
  reportArticleComment: vi.fn(),
}));

const comment = (id: number, patch: Partial<ArticleCommentDto> = {}): ArticleCommentDto => ({
  id,
  parentId: null,
  authorName: 'Аиша',
  body: `Комментарий ${id}`,
  isDeleted: false,
  isHidden: false,
  isPending: false,
  isMine: false,
  canEdit: false,
  canDelete: false,
  canReport: false,
  createdAt: '2026-11-26T10:00:00Z',
  editedAt: null,
  ...patch,
});

const page = (items: ArticleCommentDto[], viewer: ArticleCommentViewerDto, patch: Partial<ArticleCommentPageDto> = {}): ArticleCommentPageDto => ({
  items,
  total: items.filter((item) => !item.isDeleted).length,
  threads: items.filter((item) => item.parentId == null).length,
  page: 1,
  pageSize: 20,
  viewer,
  ...patch,
});

const canComment: ArticleCommentViewerDto = { canComment: true };

const renderComments = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <ArticleComments articleId={12} />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.mocked(getArticleComments).mockReset();
  vi.mocked(createArticleComment).mockReset();
  vi.mocked(updateArticleComment).mockReset();
  vi.mocked(deleteArticleComment).mockReset();
  vi.mocked(reportArticleComment).mockReset();
});

describe('ArticleComments', () => {
  it('shows the tree with names, the deleted placeholder and the edited mark, and asks an anonymous reader to sign in', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page(
      [
        comment(1, { isDeleted: true, authorName: null, body: null }),
        comment(2, { parentId: 1, authorName: 'Умар', body: '**Да**', editedAt: '2026-11-26T11:00:00Z' }),
      ],
      { canComment: false, block: 'SignInRequired' },
    ));

    renderComments();

    const items = await screen.findAllByTestId('comment');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Комментарий удалён.');
    expect(within(items[1]).getByText('Умар')).toBeTruthy();
    expect(within(items[1]).getByText('Да').tagName).toBe('STRONG');
    expect(within(items[1]).getByText('изменён')).toBeTruthy();
    expect(within(items[1]).queryByRole('button', { name: 'Ответить' })).toBeNull();
    const note = screen.getByTestId('comments-sign-in');
    expect(within(note).getByRole('link', { name: 'Войдите' }).getAttribute('href')).toBe('/login');
    expect(within(note).getByRole('link', { name: 'зарегистрируйтесь' }).getAttribute('href')).toBe('/register');
    expect(screen.queryByLabelText('Ваш комментарий')).toBeNull();
    expect(screen.getByText('1 комментарий')).toBeTruthy();
  });

  it.each([
    ['EmailNotConfirmed', 'подтвердите адрес почты'],
    ['DisplayNameRequired', 'укажите имя в профиле'],
  ] as const)('says why a signed-in reader cannot comment: %s', async (block, text) => {
    vi.mocked(getArticleComments).mockResolvedValue(page([], { canComment: false, block }));

    renderComments();

    expect((await screen.findByText(/Комментариев пока нет/)).textContent).toBeTruthy();
    expect(screen.getByText(new RegExp(text))).toBeTruthy();
    expect(screen.queryByLabelText('Ваш комментарий')).toBeNull();
  });

  it('sends a new comment with the empty trap field and reloads the list', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page([], canComment));
    vi.mocked(createArticleComment).mockResolvedValue(comment(5));

    renderComments();
    fireEvent.change(await screen.findByLabelText('Ваш комментарий'), { target: { value: 'Спасибо!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(createArticleComment).toHaveBeenCalledWith(12, { body: 'Спасибо!', parentId: null, website: '' }));
    await waitFor(() => expect(getArticleComments).toHaveBeenCalledTimes(2));
  });

  it('replies to a comment, edits one of the reader\'s own and deletes it after confirming', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page(
      [comment(1), comment(2, { parentId: 1, isMine: true, canEdit: true, canDelete: true, body: 'Мой' })],
      canComment,
    ));
    vi.mocked(createArticleComment).mockResolvedValue(comment(3));
    vi.mocked(updateArticleComment).mockResolvedValue(comment(2, { body: 'Мой, исправленный' }));
    vi.mocked(deleteArticleComment).mockResolvedValue(undefined);

    renderComments();
    const [first, mine] = await screen.findAllByTestId('comment');
    fireEvent.click(within(first).getByRole('button', { name: 'Ответить' }));
    fireEvent.change(within(first).getByLabelText('Ваш ответ'), { target: { value: 'Ответ' } });
    fireEvent.click(within(first).getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(createArticleComment).toHaveBeenCalledWith(12, { body: 'Ответ', parentId: 1, website: '' }));

    fireEvent.click(within(mine).getByRole('button', { name: 'Изменить' }));
    const editor = within(mine).getByLabelText('Текст комментария') as HTMLTextAreaElement;
    expect(editor.value).toBe('Мой');
    fireEvent.change(editor, { target: { value: 'Мой, исправленный' } });
    fireEvent.click(within(mine).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(updateArticleComment).toHaveBeenCalledWith(2, 'Мой, исправленный'));

    fireEvent.click(await within(mine).findByRole('button', { name: 'Удалить' }));
    expect(deleteArticleComment).not.toHaveBeenCalled();
    fireEvent.click(within(mine).getByRole('button', { name: 'Да, удалить' }));
    await waitFor(() => expect(deleteArticleComment).toHaveBeenCalledWith(2));
    expect(within(first).queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('keeps a comment over the length limit from being sent', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page([], canComment));

    renderComments();
    fireEvent.change(await screen.findByLabelText('Ваш комментарий'), { target: { value: 'а'.repeat(2001) } });

    expect((screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('2001 из 2000')).toBeTruthy();
  });

  it('loads the next page of threads on request', async () => {
    vi.mocked(getArticleComments).mockImplementation(async (_articleId, pageNumber) =>
      pageNumber === 1
        ? page([comment(1)], canComment, { threads: 2, pageSize: 1, total: 2 })
        : page([comment(2)], canComment, { threads: 2, page: 2, pageSize: 1, total: 2 }));

    renderComments();
    fireEvent.click(await screen.findByRole('button', { name: 'Показать ещё' }));

    await waitFor(() => expect(screen.getAllByTestId('comment')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  // C-02 (#128): moderation as readers see it.
  it('shows the hidden placeholder, marks the reader\'s own comment awaiting moderation and reports someone else\'s', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page(
      [
        comment(1, { isHidden: true, authorName: null, body: null }),
        comment(2, { parentId: 1, canReport: true }),
        comment(3, { isMine: true, isPending: true, canEdit: true, canDelete: true, body: 'Мой первый' }),
      ],
      canComment,
    ));
    vi.mocked(reportArticleComment).mockResolvedValue();

    renderComments();

    const items = await screen.findAllByTestId('comment');
    expect(items[0].textContent).toContain('Комментарий скрыт модератором.');
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[2]).getByTestId('comment-pending').textContent).toContain('На проверке');
    expect(within(items[2]).queryByRole('button', { name: 'Пожаловаться' })).toBeNull();
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Пожаловаться' }));
    const form = within(items[1]).getByRole('form', { name: 'Жалоба на комментарий' });
    fireEvent.change(within(form).getByLabelText('Что не так'), { target: { value: 'Abuse' } });
    fireEvent.change(within(form).getByLabelText('Пояснение (необязательно)'), { target: { value: '  Грубо ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Отправить жалобу' }));

    await waitFor(() => expect(within(items[1]).getByRole('status').textContent).toBe('Жалоба отправлена. Спасибо!'));
    expect(reportArticleComment).toHaveBeenCalledWith(2, { reason: 'Abuse', note: 'Грубо' });
    expect(within(items[1]).queryByRole('button', { name: 'Пожаловаться' })).toBeNull();
  });

  it('tells a barred reader until when they may not comment', async () => {
    vi.mocked(getArticleComments).mockResolvedValue(page([], { canComment: false, block: 'Banned', bannedUntil: '2026-12-05T10:00:00Z' }));

    renderComments();

    expect((await screen.findByTestId('comments-banned')).textContent).toMatch(/^Модератор запретил вам комментировать до .*2026/);
    expect(screen.queryByLabelText('Ваш комментарий')).toBeNull();
  });
});
