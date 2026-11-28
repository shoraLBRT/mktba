import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import {
  banCommenter,
  getCommentBans,
  getCommentModerationQueue,
  moderateComment,
  unbanCommenter,
} from '../../services/commentModerationService';
import { deleteArticleComment } from '../../services/commentService';
import type { CommentModerationItemDto, CommentModerationPageDto } from '../../shared/types/ApiTypes';
import AdminCommentsPage from './AdminCommentsPage';

vi.mock('../../services/commentModerationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/commentModerationService')>()),
  getCommentModerationQueue: vi.fn(),
  moderateComment: vi.fn(),
  getCommentBans: vi.fn(),
  banCommenter: vi.fn(),
  unbanCommenter: vi.fn(),
}));

vi.mock('../../services/commentService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/commentService')>()),
  deleteArticleComment: vi.fn(),
}));

const item = (id: number, patch: Partial<CommentModerationItemDto> = {}): CommentModerationItemDto => ({
  id,
  articleId: 5,
  articleTitle: 'Намаз путника',
  articleSlug: 'namaz-putnika',
  articlePublished: true,
  parentId: null,
  authorId: 40 + id,
  authorName: 'Новичок',
  authorEmail: 'novice@mktba.test',
  authorBanned: false,
  authorBannedUntil: null,
  body: `Комментарий ${id}`,
  status: 'Pending',
  holdReason: 'NewAuthor',
  createdAt: '2026-11-28T10:00:00Z',
  editedAt: null,
  moderatedAt: null,
  reports: [],
  ...patch,
});

const pageOf = (items: CommentModerationItemDto[]): CommentModerationPageDto => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  counts: { pending: 2, reported: 1, hidden: 0 },
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminCommentsPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.mocked(getCommentModerationQueue).mockReset();
  vi.mocked(moderateComment).mockReset();
  vi.mocked(getCommentBans).mockReset();
  vi.mocked(banCommenter).mockReset();
  vi.mocked(unbanCommenter).mockReset();
  vi.mocked(deleteArticleComment).mockReset();
});

describe('AdminCommentsPage', () => {
  it('shows the held comments with why they are held, approves, hides and deletes them', async () => {
    vi.mocked(getCommentModerationQueue).mockResolvedValue(pageOf([
      item(1),
      item(2, { holdReason: 'Reported', reports: [{ reason: 'Abuse', note: 'Грубо', reporterName: 'Аиша', createdAt: '2026-11-28T11:00:00Z' }] }),
    ]));
    vi.mocked(getCommentBans).mockResolvedValue([]);
    vi.mocked(moderateComment).mockResolvedValue();
    vi.mocked(deleteArticleComment).mockResolvedValue();

    renderPage();

    const items = await screen.findAllByTestId('moderation-item');
    expect(screen.getByRole('button', { name: 'На проверке (2)' }).getAttribute('aria-pressed')).toBe('true');
    expect(items[0].textContent).toContain('Новичок (novice@mktba.test)');
    expect(items[0].textContent).toContain('Новый читатель');
    expect(within(items[0]).getByRole('link', { name: 'Статья: Намаз путника' }).getAttribute('href')).toBe('/namaz-putnika');
    expect(items[1].textContent).toContain('Жалобы (1)');
    expect(items[1].textContent).toContain('Оскорбления — Аиша');
    expect(items[1].textContent).toContain('Грубо');
    expect(screen.getByText('Запретов нет.')).toBeTruthy();

    fireEvent.click(within(items[0]).getByRole('button', { name: 'Одобрить' }));
    await waitFor(() => expect(moderateComment).toHaveBeenCalledWith(1, 'Approve'));
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Скрыть' }));
    await waitFor(() => expect(moderateComment).toHaveBeenCalledWith(2, 'Hide'));
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Удалить' }));
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Да, удалить' }));
    await waitFor(() => expect(deleteArticleComment).toHaveBeenCalledWith(2));
  });

  it('switches to the hidden queue, where a comment can be brought back', async () => {
    vi.mocked(getCommentModerationQueue).mockImplementation(async (queue) =>
      queue === 'Hidden' ? pageOf([item(3, { status: 'Hidden', holdReason: undefined })]) : pageOf([]));
    vi.mocked(getCommentBans).mockResolvedValue([]);

    renderPage();
    expect(await screen.findByText('Проверять нечего.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скрытые (0)' }));

    const hidden = await screen.findByTestId('moderation-item');
    expect(getCommentModerationQueue).toHaveBeenLastCalledWith('Hidden', 1);
    expect(within(hidden).getByRole('button', { name: 'Вернуть' })).toBeTruthy();
    expect(within(hidden).queryByRole('button', { name: 'Скрыть' })).toBeNull();
  });

  it('bars the author from commenting and lifts a ban from the list', async () => {
    vi.mocked(getCommentModerationQueue).mockResolvedValue(pageOf([item(1)]));
    vi.mocked(getCommentBans).mockResolvedValue([
      { userId: 7, email: 'spam@mktba.test', displayName: null, until: null, reason: 'Реклама', createdAt: '2026-11-27T10:00:00Z', createdByName: 'Админ' },
    ]);
    vi.mocked(banCommenter).mockResolvedValue({
      userId: 41, email: 'novice@mktba.test', displayName: 'Новичок', until: '2026-12-28T10:00:00Z', reason: null, createdAt: '2026-11-28T10:00:00Z', createdByName: 'Админ',
    });
    vi.mocked(unbanCommenter).mockResolvedValue();

    renderPage();

    const ban = await screen.findByTestId('comment-ban');
    expect(ban.textContent).toContain('spam@mktba.test');
    expect(ban.textContent).toContain('навсегда');
    expect(ban.textContent).toContain('Реклама');
    const comment = await screen.findByTestId('moderation-item');
    fireEvent.click(within(comment).getByRole('button', { name: 'Запретить комментировать' }));
    const form = within(comment).getByRole('form', { name: 'Запрет комментировать: Новичок' });
    fireEvent.change(within(form).getByLabelText('Срок'), { target: { value: '30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Запретить' }));
    await waitFor(() => expect(banCommenter).toHaveBeenCalledWith(41, { days: 30, reason: null }));

    fireEvent.click(within(ban).getByRole('button', { name: 'Снять запрет' }));
    await waitFor(() => expect(vi.mocked(unbanCommenter).mock.calls[0][0]).toBe(7));
  });
});
