import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { closeArticleRemark, reopenArticleRemark, replyToArticleRemark } from '../../services/articleRemarkService';
import type { ArticleRemarkDto } from '../../shared/types/ApiTypes';
import { RemarkList } from './RemarkThread';

vi.mock('../../services/articleRemarkService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/articleRemarkService')>()),
  replyToArticleRemark: vi.fn(),
  closeArticleRemark: vi.fn(),
  reopenArticleRemark: vi.fn(),
}));

const remark = (patch: Partial<ArticleRemarkDto> = {}): ArticleRemarkDto => ({
  id: 7,
  articleId: 12,
  revisionNumber: 3,
  paragraphId: 21,
  opinionId: null,
  onOpinion: false,
  paragraphOrder: 2,
  currentParagraphOrder: 2,
  excerpt: 'Путник сокращает намаз.',
  blockRemoved: false,
  status: 'Open',
  scholarName: 'Шейх Ахмад',
  isMine: false,
  createdAt: '2026-11-26T11:00:00Z',
  updatedAt: '2026-11-26T11:00:00Z',
  closedAt: null,
  canReply: true,
  canClose: true,
  canReopen: false,
  messages: [
    { id: 1, authorName: 'Шейх Ахмад', participant: 'Scholar', isMine: false, body: 'Нужен источник.', createdAt: '2026-11-26T11:00:00Z' },
    { id: 2, authorName: null, participant: 'Editor', isMine: false, body: 'Согласен.', createdAt: '2026-11-26T11:30:00Z' },
    { id: 3, authorName: null, participant: 'Author', isMine: true, body: 'Добавлю.', createdAt: '2026-11-26T12:00:00Z' },
  ],
  ...patch,
});

const renderList = (remarks: ArticleRemarkDto[], onJump?: (paragraphId: number) => void) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <RemarkList remarks={remarks} onJump={onJump} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.mocked(replyToArticleRemark).mockReset();
  vi.mocked(closeArticleRemark).mockReset();
  vi.mocked(reopenArticleRemark).mockReset();
});

describe('RemarkList', () => {
  it("given an author's open remark, when they reply and resolve it, then each action goes to the API with the text typed", async () => {
    const onJump = vi.fn();
    vi.mocked(replyToArticleRemark).mockResolvedValue(remark());
    vi.mocked(closeArticleRemark).mockResolvedValue(remark({ status: 'Resolved', canReply: false, canClose: false }));

    renderList([remark()], onJump);

    const thread = screen.getByRole('article', { name: 'Абзац 2: Открыто' });
    expect(within(thread).getByText('Путник сокращает намаз.')).toBeTruthy();
    expect(within(thread).getByText(/Учёный: Шейх Ахмад/)).toBeTruthy();
    const authors = within(within(thread).getByRole('list', { name: 'Обсуждение замечания' })).getAllByRole('listitem')
      .map((item) => item.firstElementChild?.textContent?.split(' · ')[0]);
    expect(authors).toEqual(['Шейх Ахмад', 'Редактор', 'Вы']);
    expect(within(thread).getByRole('button', { name: 'Ответить' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(within(thread).getByLabelText('Ответ или комментарий'), { target: { value: ' Готово ' } });
    fireEvent.click(within(thread).getByRole('button', { name: 'Ответить' }));
    await waitFor(() => expect(replyToArticleRemark).toHaveBeenCalledWith(7, 'Готово'));

    fireEvent.click(within(thread).getByRole('button', { name: 'Исправлено' }));
    await waitFor(() => expect(closeArticleRemark).toHaveBeenCalledWith(7, 'Resolved', null));

    fireEvent.click(within(thread).getByRole('button', { name: 'К блоку' }));
    expect(onJump).toHaveBeenCalledWith(21);
  });

  it('given closed remarks and one on a deleted block, when the list opens, then the closed ones are behind a toggle and the deleted block says so', async () => {
    vi.mocked(reopenArticleRemark).mockResolvedValue(remark());
    renderList([
      remark({ id: 8, blockRemoved: true, paragraphId: null, currentParagraphOrder: null, canClose: false }),
      remark({ id: 9, status: 'Closed', canReply: false, canClose: false, canReopen: true, paragraphOrder: 1, currentParagraphOrder: 3 }),
    ], vi.fn());

    expect(screen.getByText('Открытых замечаний: 1')).toBeTruthy();
    const removed = screen.getByRole('article', { name: 'Абзац 2 · блок удалён: Открыто' });
    expect(within(removed).queryByRole('button', { name: 'К блоку' })).toBeNull();
    expect(screen.queryByRole('article', { name: /Закрыто без исправлений/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Показать закрытые (1)' }));
    const closed = screen.getByRole('article', { name: 'Абзац 1 · сейчас абзац 3: Закрыто без исправлений' });
    expect(within(closed).queryByRole('button', { name: 'Ответить' })).toBeNull();
    fireEvent.click(within(closed).getByRole('button', { name: 'Открыть снова' }));
    await waitFor(() => expect(reopenArticleRemark).toHaveBeenCalledWith(9, null));
  });
});
