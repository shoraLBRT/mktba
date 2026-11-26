import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LocalizationProvider } from '../../localization/provider';
import { getArticleReviewContext, getArticlesForReview, submitArticleReview } from '../../services/articleReviewService';
import { getSchoolsByArticleId, getSystemSchools } from '../../services/schoolService';
import type { ArticleReviewContextDto } from '../../shared/types/ApiTypes';
import AdminArticleReviewPage from './AdminArticleReviewPage';
import AdminArticleReviewsPage from './AdminArticleReviewsPage';

vi.mock('../../services/articleReviewService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/articleReviewService')>()),
  getArticlesForReview: vi.fn(),
  getArticleReviewContext: vi.fn(),
  submitArticleReview: vi.fn(),
}));

vi.mock('../../services/schoolService', () => ({ getSystemSchools: vi.fn(), getSchoolsByArticleId: vi.fn() }));

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
        { order: 1, opinions: [{ content: 'Общий абзац', isDefault: true, schoolIds: [] }] },
        {
          order: 2,
          opinions: [
            { content: 'Мнение ханафитов', isDefault: false, schoolIds: [1] },
            { content: 'Мнение по умолчанию', isDefault: true, schoolIds: [2] },
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
});

afterEach(() => {
  cleanup();
  vi.mocked(getArticlesForReview).mockReset();
  vi.mocked(getArticleReviewContext).mockReset();
  vi.mocked(submitArticleReview).mockReset();
});

describe('AdminArticleReviewsPage', () => {
  it("given published articles, when the list opens, then each shows its revision and the caller's mark, and the search asks again", async () => {
    vi.mocked(getArticlesForReview).mockResolvedValue({
      items: [
        { articleId: 12, title: 'Намаз путника', slug: 'namaz-putnika', locale: 'ru', latestRevisionNumber: 3, updatedAt: '2026-11-26T10:00:00Z',
          myLatestReview: { revisionNumber: 2, verdict: 'HasErrors', updatedAt: '2026-11-25T10:00:00Z' } },
        { articleId: 13, title: 'Закят', slug: 'zakyat', locale: 'ru', latestRevisionNumber: 1, updatedAt: '2026-11-24T10:00:00Z' },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    renderAt('/admin/article-reviews');

    const row = await screen.findByTestId('article-review-row-12');
    expect(within(row).getByRole('link', { name: 'Ревью статьи «Намаз путника»' }).getAttribute('href')).toBe('/admin/article-reviews/12');
    expect(within(row).getByText('Есть ошибки (ревизия 2)')).toBeTruthy();
    expect(within(screen.getByTestId('article-review-row-13')).getByText('Нет')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Поиск по названию'), { target: { value: 'закят' } });
    await waitFor(() => expect(getArticlesForReview).toHaveBeenLastCalledWith({ query: 'закят', page: 1, pageSize: 20 }));
  });
});

describe('AdminArticleReviewPage', () => {
  it('given a scholar without a madhab, when they give errors with a comment, then the verdict goes with the revision read', async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context());
    vi.mocked(submitArticleReview).mockResolvedValue({
      id: 1, articleId: 12, revisionNumber: 3, verdict: 'HasErrors', comment: 'Неверная ссылка', mazhab: null,
      createdAt: '2026-11-26T11:00:00Z', updatedAt: '2026-11-26T11:00:00Z', isLatestRevision: true,
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
          createdAt: '2026-11-26T09:00:00Z', updatedAt: '2026-11-26T09:00:00Z', isLatestRevision: true },
        { id: 2, articleId: 12, revisionNumber: 1, verdict: 'ConfirmedWithRemarks', comment: 'Уточнить источник', mazhab: 'hanafi',
          createdAt: '2026-11-20T09:00:00Z', updatedAt: '2026-11-20T09:00:00Z', isLatestRevision: false },
      ],
    }));

    renderAt('/admin/article-reviews/12');

    expect(await screen.findByText(/читатели мазхаба «Ханафитский»/)).toBeTruthy();
    expect(screen.getByText(/Мнение ханафитов/)).toBeTruthy();
    expect(screen.queryByText(/Мнение по умолчанию/)).toBeNull();
    expect(screen.getByText('Вы уже оценили эту ревизию: новая отметка заменит прежнюю.')).toBeTruthy();
    expect(within(screen.getByTestId('my-review-1')).getByText('Подтверждаю с замечаниями · более ранняя ревизия')).toBeTruthy();
    expect(within(screen.getByTestId('my-review-3')).getByText('Подтверждаю · текущая версия')).toBeTruthy();
  });

  it('given an admin, when the page opens, then the text is shown without the form', async () => {
    vi.mocked(getArticleReviewContext).mockResolvedValue(context({ canReview: false }));

    renderAt('/admin/article-reviews/12');

    expect((await screen.findByRole('note')).textContent).toContain('только учёные с одобренной заявкой');
    expect(screen.queryByRole('button', { name: 'Отправить отметку' })).toBeNull();
  });
});
