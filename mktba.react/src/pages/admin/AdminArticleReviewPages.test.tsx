import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleReviewContext, getArticlesForReview, getMyReviewHistory, submitArticleReview } from '../../services/articleReviewService';
import { createArticleRemark, getArticleRemarks, getMyRemarks } from '../../services/articleRemarkService';
import { getSchoolsByArticleId, getSystemSchools } from '../../services/schoolService';
import type { ArticleRemarkDto, ArticleReviewContextDto } from '../../shared/types/ApiTypes';
import AdminArticleReviewPage from './AdminArticleReviewPage';
import AdminArticleReviewsPage from './AdminArticleReviewsPage';

vi.mock('../../services/articleReviewService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/articleReviewService')>()),
  getArticlesForReview: vi.fn(),
  getArticleReviewContext: vi.fn(),
  getMyReviewHistory: vi.fn(),
  submitArticleReview: vi.fn(),
}));

vi.mock('../../services/schoolService', () => ({ getSystemSchools: vi.fn(), getSchoolsByArticleId: vi.fn() }));

vi.mock('../../services/articleRemarkService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/articleRemarkService')>()),
  getArticleRemarks: vi.fn(),
  getMyRemarks: vi.fn(),
  createArticleRemark: vi.fn(),
}));

const remark = (patch: Partial<ArticleRemarkDto> = {}): ArticleRemarkDto => ({
  id: 7,
  articleId: 12,
  revisionNumber: 3,
  paragraphId: 21,
  opinionId: 202,
  onOpinion: true,
  paragraphOrder: 2,
  currentParagraphOrder: 2,
  excerpt: 'Мнение по умолчанию',
  blockRemoved: false,
  status: 'Open',
  scholarName: null,
  isMine: true,
  createdAt: '2026-11-26T11:00:00Z',
  updatedAt: '2026-11-26T11:00:00Z',
  closedAt: null,
  canReply: true,
  canClose: false,
  canReopen: false,
  messages: [{ id: 1, authorName: null, participant: 'Scholar', isMine: true, body: 'Нужен источник.', createdAt: '2026-11-26T11:00:00Z' }],
  ...patch,
});

const context = (patch: Partial<ArticleReviewContextDto> = {}): ArticleReviewContextDto => ({
  articleId: 12,
  title: 'Намаз путника',
  slug: 'namaz-putnika',
  locale: 'ru',
  revision: {
    number: 3,
    createdAt: '2026-11-26T10:00:00Z',
    snapshot: {
      schemaVersion: 3,
      title: 'Намаз путника',
      slug: 'namaz-putnika',
      tags: [],
      relatedLinks: [],
      paragraphs: [
        { id: 11, order: 1, opinions: [{ id: 101, content: 'Общий абзац', isDefault: true, schoolIds: [] }] },
        {
          id: 21,
          order: 2,
          opinions: [
            { id: 201, content: 'Мнение ханафитов', isDefault: false, schoolIds: [1] },
            { id: 202, content: 'Мнение по умолчанию', isDefault: true, schoolIds: [2] },
          ],
        },
      ],
    },
  },
  scope: { mazhab: null, schoolId: null },
  canReview: true,
  myReviews: [],
  ...patch,
});

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/article-reviews" element={<AdminArticleReviewsPage />} />
            <Route path="/admin/article-reviews/:articleId" element={<AdminArticleReviewPage />} />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.mocked(getSystemSchools).mockResolvedValue([
    { id: 1, name: 'Ханафитский мазхаб', shortName: 'Хан', slug: 'hanafi', isSystem: true } as never,
    { id: 2, name: 'Маликитский мазхаб', shortName: 'Мал', slug: 'maliki', isSystem: true } as never,
  ]);
  vi.mocked(getSchoolsByArticleId).mockResolvedValue([]);
  vi.mocked(getArticleRemarks).mockResolvedValue({ canCreate: false, items: [] });
});

afterEach(() => {
  cleanup();
  vi.mocked(getArticlesForReview).mockReset();
  vi.mocked(getArticleReviewContext).mockReset();
  vi.mocked(getMyReviewHistory).mockReset();
  vi.mocked(getMyRemarks).mockReset();
  vi.mocked(submitArticleReview).mockReset();
  vi.mocked(createArticleRemark).mockReset();
});

describe('AdminArticleReviewsPage', () => {
  it("given published articles, when the list opens, then each shows its revision and the caller's mark, the re-review count, and the search asks again", async () => {
    vi.mocked(getArticlesForReview).mockResolvedValue({
      items: [
        { articleId: 12, title: 'Намаз путника', slug: 'namaz-putnika', locale: 'ru', latestRevisionNumber: 3, updatedAt: '2026-11-26T10:00:00Z',
          myLatestReview: { revisionNumber: 2, verdict: 'HasErrors', updatedAt: '2026-11-25T10:00:00Z', isCurrent: false },
          matchesSpecialization: false, matchesMazhab: false },
        { articleId: 14, title: 'Пост', slug: 'post', locale: 'ru', latestRevisionNumber: 4, updatedAt: '2026-11-25T10:00:00Z',
          myLatestReview: { revisionNumber: 3, verdict: 'Confirmed', updatedAt: '2026-11-25T09:00:00Z', isCurrent: true },
          matchesSpecialization: false, matchesMazhab: false },
        { articleId: 13, title: 'Закят', slug: 'zakyat', locale: 'ru', latestRevisionNumber: 1, updatedAt: '2026-11-24T10:00:00Z',
          matchesSpecialization: false, matchesMazhab: false },
      ],
      total: 3,
      page: 1,
      pageSize: 20,
      needsReReviewTotal: 1,
      mazhab: null,
      specializationKeywords: [],
    });

    renderAt('/admin/article-reviews');

    const row = await screen.findByTestId('article-review-row-12');
    expect(within(row).getByRole('link', { name: 'Ревью статьи «Намаз путника»' }).getAttribute('href')).toBe('/admin/article-reviews/12');
    expect(within(row).getByText('Есть ошибки (ревизия 2)')).toBeTruthy();
    expect(within(row).getByText('— нужно повторное ревью')).toBeTruthy();
    expect(within(screen.getByTestId('article-review-row-14')).queryByText(/повторное ревью/)).toBeNull();
    expect(screen.getByTestId('article-review-rereview-count').textContent).toMatch(/^Нужно повторное ревью: 1\./);
    expect(within(screen.getByTestId('article-review-row-13')).getByText('Нет')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Поиск по названию'), { target: { value: 'закят' } });
    await waitFor(() => expect(getArticlesForReview).toHaveBeenLastCalledWith({ query: 'закят', queueOnly: true, page: 1, pageSize: 20 }));
    expect(screen.getByTestId('article-review-match-basis').textContent).toContain('В специализации из заявки нет слов');
  });

  it('given the queue, when it opens, then it says what it matches by, marks the matching articles, and «Все статьи» asks for every article', async () => {
    vi.mocked(getArticlesForReview).mockResolvedValue({
      items: [
        { articleId: 13, title: 'Закят', slug: 'zakyat', locale: 'ru', latestRevisionNumber: 1, updatedAt: '2026-11-24T10:00:00Z',
          matchesSpecialization: true, matchesMazhab: true },
      ],
      total: 1, page: 1, pageSize: 20, needsReReviewTotal: 0, mazhab: 'hanafi', specializationKeywords: ['фикх', 'хадисоведение'],
    });

    renderAt('/admin/article-reviews');

    const basis = await screen.findByTestId('article-review-match-basis');
    expect(basis.textContent).toContain('Подбор по специализации из заявки: фикх, хадисоведение.');
    expect(basis.textContent).toContain('Выше идут статьи с мнениями мазхаба «Ханафитский».');
    const row = screen.getByTestId('article-review-row-13');
    expect(within(row).getByText('по специализации')).toBeTruthy();
    expect(within(row).getByText('мнение вашего мазхаба')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Очередь' }).getAttribute('aria-current')).toBe('page');
    expect(getArticlesForReview).toHaveBeenLastCalledWith({ query: '', queueOnly: true, page: 1, pageSize: 20 });

    fireEvent.click(screen.getByRole('link', { name: 'Все статьи' }));

    await waitFor(() => expect(getArticlesForReview).toHaveBeenLastCalledWith({ query: '', queueOnly: false, page: 1, pageSize: 20 }));
    expect(screen.getByRole('link', { name: 'Все статьи' }).getAttribute('aria-current')).toBe('page');
  });

  it("given the scholar's reviews, when «Мои отметки» opens, then each shows its revision, verdict and whether it is current", async () => {
    vi.mocked(getMyReviewHistory).mockResolvedValue({
      items: [
        { reviewId: 5, articleId: 12, title: 'Намаз путника', isAvailable: true, revisionNumber: 2, latestRevisionNumber: 3, verdict: 'Confirmed',
          comment: null, mazhab: null, updatedAt: '2026-11-25T10:00:00Z', isLatestRevision: false, isCurrent: false },
        { reviewId: 4, articleId: 14, title: 'Пост', isAvailable: false, revisionNumber: 1, latestRevisionNumber: 1, verdict: 'HasErrors',
          comment: 'Ошибка', mazhab: null, updatedAt: '2026-11-24T10:00:00Z', isLatestRevision: true, isCurrent: true },
      ],
      total: 2, page: 1, pageSize: 20,
    });

    renderAt('/admin/article-reviews?tab=reviews');

    const stale = await screen.findByTestId('my-review-row-5');
    expect(within(stale).getByRole('link', { name: 'Ревью статьи «Намаз путника»' }).getAttribute('href')).toBe('/admin/article-reviews/12');
    expect(within(stale).getByText('2 из 3')).toBeTruthy();
    expect(within(stale).getByText('Подтверждаю')).toBeTruthy();
    expect(within(stale).getByText(/^для предыдущей версии/)).toBeTruthy();
    const archived = screen.getByTestId('my-review-row-4');
    expect(within(archived).queryByRole('link')).toBeNull();
    expect(within(archived).getByText('статья сейчас не опубликована')).toBeTruthy();
    expect(within(archived).getByText('текущая версия')).toBeTruthy();
    expect(getArticlesForReview).not.toHaveBeenCalled();
  });

  it("given the scholar's remarks, when «Мои замечания» opens, then the open ones are shown and the filter asks for the closed ones", async () => {
    vi.mocked(getMyRemarks).mockResolvedValue({
      items: [
        { remarkId: 7, articleId: 12, articleTitle: 'Намаз путника', isAvailable: true, revisionNumber: 3, onOpinion: true,
          excerpt: 'Мнение по умолчанию', status: 'Open', createdAt: '2026-11-26T11:00:00Z', updatedAt: '2026-11-26T11:00:00Z', messageCount: 2 },
      ],
      total: 1, page: 1, pageSize: 20, openTotal: 1,
    });

    renderAt('/admin/article-reviews?tab=remarks');

    const row = await screen.findByTestId('my-remark-row-7');
    expect(within(row).getByText('Ревизия 3, одно мнение: «Мнение по умолчанию»')).toBeTruthy();
    expect(within(row).getByText('Открыто')).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'Ревью статьи «Намаз путника»' })).toBeTruthy();
    expect(screen.getByTestId('my-remarks-open-count').textContent).toBe('Открытых замечаний: 1');
    expect(getMyRemarks).toHaveBeenLastCalledWith(true, 1, 20);

    fireEvent.click(screen.getByRole('button', { name: 'Закрытые' }));

    await waitFor(() => expect(getMyRemarks).toHaveBeenLastCalledWith(false, 1, 20));
    expect(screen.getByRole('button', { name: 'Закрытые' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('AdminArticleReviewPage', () => {
  it('given a scholar without a madhab, when they give errors with a comment, then the verdict goes with the revision read', async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context());
    vi.mocked(submitArticleReview).mockResolvedValue({
      id: 1, articleId: 12, revisionNumber: 3, verdict: 'HasErrors', comment: 'Неверная ссылка', mazhab: null,
      createdAt: '2026-11-26T11:00:00Z', updatedAt: '2026-11-26T11:00:00Z', isLatestRevision: true, isCurrent: true,
    });

    renderAt('/admin/article-reviews/12');

    expect(await screen.findByText('Ваша отметка касается всей статьи.')).toBeTruthy();
    expect(screen.getByText(/Мнение ханафитов/)).toBeTruthy();
    expect(screen.getByText(/Мнение по умолчанию/)).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Отправить отметку' });
    fireEvent.click(screen.getByRole('radio', { name: 'Есть ошибки' }));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: ' Неверная ссылка ' } });
    fireEvent.click(submit);

    await waitFor(() => expect(submitArticleReview).toHaveBeenCalledWith(12, { revisionNumber: 3, verdict: 'HasErrors', comment: 'Неверная ссылка' }));
    expect((await screen.findByRole('status')).textContent).toContain('Отметка для ревизии 3 сохранена.');
  });

  it("given a scholar of a madhab, when the page opens, then only their readers' text is shown and earlier marks are listed", async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context({
      scope: { mazhab: 'hanafi', schoolId: 1 },
      myReviews: [
        { id: 4, articleId: 12, revisionNumber: 3, verdict: 'Confirmed', comment: null, mazhab: 'hanafi',
          createdAt: '2026-11-26T09:00:00Z', updatedAt: '2026-11-26T09:00:00Z', isLatestRevision: true, isCurrent: true },
        { id: 3, articleId: 12, revisionNumber: 2, verdict: 'HasErrors', comment: 'Ошибка', mazhab: 'hanafi',
          createdAt: '2026-11-22T09:00:00Z', updatedAt: '2026-11-22T09:00:00Z', isLatestRevision: false, isCurrent: true },
        { id: 2, articleId: 12, revisionNumber: 1, verdict: 'ConfirmedWithRemarks', comment: 'Уточнить источник', mazhab: 'hanafi',
          createdAt: '2026-11-20T09:00:00Z', updatedAt: '2026-11-20T09:00:00Z', isLatestRevision: false, isCurrent: false },
      ],
    }));

    renderAt('/admin/article-reviews/12');

    expect(await screen.findByText(/читатели мазхаба «Ханафитский»/)).toBeTruthy();
    expect(screen.getByText(/Мнение ханафитов/)).toBeTruthy();
    expect(screen.queryByText(/Мнение по умолчанию/)).toBeNull();
    expect(screen.getByText('Вы уже оценили эту ревизию: новая отметка заменит прежнюю.')).toBeTruthy();
    expect(within(screen.getByTestId('my-review-1')).getByText('Подтверждаю с замечаниями · для предыдущей версии: статью с тех пор существенно правили')).toBeTruthy();
    expect(within(screen.getByTestId('my-review-2')).getByText('Есть ошибки · более ранняя ревизия, текст с тех пор по существу не менялся')).toBeTruthy();
    expect(within(screen.getByTestId('my-review-3')).getByText('Подтверждаю · текущая версия')).toBeTruthy();
  });

  it('given a verified scholar, when they leave a remark on one opinion of a block, then it names the revision, the paragraph and the opinion and joins their remarks', async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context());
    vi.mocked(getArticleRemarks).mockResolvedValue({ canCreate: true, items: [] });
    vi.mocked(createArticleRemark).mockResolvedValue(remark());

    renderAt('/admin/article-reviews/12');

    fireEvent.click(await screen.findByRole('button', { name: 'Оставить замечание: Абзац 2' }));
    const form = screen.getByRole('form', { name: 'Оставить замечание: Абзац 2' });
    fireEvent.change(within(form).getByLabelText('К чему относится'), { target: { value: '202' } });
    fireEvent.change(within(form).getByLabelText('Текст замечания'), { target: { value: '  Нужен источник. ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Отправить замечание' }));

    await waitFor(() =>
      expect(createArticleRemark).toHaveBeenCalledWith(12, { revisionNumber: 3, paragraphId: 21, opinionId: 202, body: 'Нужен источник.' }),
    );
    expect(await screen.findByText('Замечание отправлено авторам статьи.')).toBeTruthy();
    const thread = screen.getByRole('article', { name: 'Абзац 2, одно мнение: Открыто' });
    expect(within(thread).getByText('Нужен источник.')).toBeTruthy();
    expect(within(thread).getByRole('button', { name: 'Ответить' })).toBeTruthy();
    expect(within(thread).queryByRole('button', { name: 'Исправлено' })).toBeNull();
    // A plain paragraph offers no choice of opinion.
    fireEvent.click(screen.getByRole('button', { name: 'Оставить замечание: Абзац 1' }));
    expect(within(screen.getByRole('form', { name: 'Оставить замечание: Абзац 1' })).queryByLabelText('К чему относится')).toBeNull();
  });

  it('given an admin, when the page opens, then the text is shown without the form', async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context({ canReview: false }));

    renderAt('/admin/article-reviews/12');

    expect((await screen.findByRole('note')).textContent).toContain('только учёные с одобренной заявкой');
    expect(screen.queryByRole('button', { name: 'Отправить отметку' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Оставить замечание/ })).toBeNull();
  });
});
