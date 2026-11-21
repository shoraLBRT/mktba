import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { changeArticleStatus, getReviewQueue } from '../../services/adminService';
import { compareArticleRevisions, getArticleRevision } from '../../services/Article/revisionService';
import { getSchoolsByArticleId, getSystemSchools } from '../../services/schoolService';
import type { ArticleReadDto, ArticleRevisionDto, ArticleSnapshotDto, ReviewQueueItemDto } from '../../shared/types/ApiTypes';
import AdminReviewArticlePage from './AdminReviewArticlePage';

vi.mock('../../services/adminService', () => ({ getReviewQueue: vi.fn(), changeArticleStatus: vi.fn() }));
vi.mock('../../services/Article/revisionService', () => ({ compareArticleRevisions: vi.fn(), getArticleRevision: vi.fn() }));
vi.mock('../../services/schoolService', () => ({ getSystemSchools: vi.fn(), getSchoolsByArticleId: vi.fn() }));

const item = (overrides: Partial<ReviewQueueItemDto> = {}): ReviewQueueItemDto => ({
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  locale: 'ru',
  authorId: 2,
  authorDisplayName: 'Автор',
  submittedAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T09:00:00Z',
  publishedAt: null,
  latestRevisionNumber: 2,
  publishedRevisionNumber: null,
  ...overrides,
});

const snapshot = (text: string): ArticleSnapshotDto => ({
  schemaVersion: 3,
  title: 'Намаз',
  slug: 'namaz',
  summary: null,
  tags: [],
  paragraphs: [{ order: 1, opinions: [{ content: text, isDefault: true, schoolIds: [] }] }],
  relatedLinks: [],
});

const revision = (number: number, text: string): ArticleRevisionDto =>
  ({ revision: { id: number, number, createdAt: '2026-11-20T09:00:00Z', isPublished: false }, snapshot: snapshot(text) });

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={['/admin/review/7']}>
          <Routes>
            <Route path="/admin/review/:articleId" element={<AdminReviewArticlePage />} />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.mocked(getReviewQueue).mockReset();
  vi.mocked(changeArticleStatus).mockReset();
  vi.mocked(compareArticleRevisions).mockReset();
  vi.mocked(getArticleRevision).mockReset();
});

vi.mocked(getSystemSchools).mockResolvedValue([]);
vi.mocked(getSchoolsByArticleId).mockResolvedValue([]);

describe('AdminReviewArticlePage', () => {
  it('given a published article under review, when opened, then compares the published revision with the newest', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([item({ publishedRevisionNumber: 1, latestRevisionNumber: 3 })]);
    vi.mocked(compareArticleRevisions).mockResolvedValue({ from: revision(1, 'Старый текст'), to: revision(3, 'Новый текст') });

    renderPage();

    expect(await screen.findByText(/ревизия 1\) → на проверке \(ревизия 3\)/)).toBeTruthy();
    expect(compareArticleRevisions).toHaveBeenCalledWith(7, 1, 3);
    expect(await screen.findByText(/Новый текст/)).toBeTruthy();
    expect(screen.getByText(/Старый текст/).closest('[data-diff]')?.getAttribute('data-diff')).toBe('removed');
  });

  it('given a new article, when opened, then shows its newest revision as all new', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([item()]);
    vi.mocked(getArticleRevision).mockResolvedValue(revision(2, 'Весь текст'));

    renderPage();

    expect(await screen.findByText(/Статья ещё не публиковалась/)).toBeTruthy();
    expect(getArticleRevision).toHaveBeenCalledWith(7, 2);
    expect((await screen.findByText(/Весь текст/)).closest('[data-diff]')?.getAttribute('data-diff')).toBe('added');
  });

  it('given no comment, when returning, then the button stays disabled until one is typed and the move carries it', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([item()]);
    vi.mocked(getArticleRevision).mockResolvedValue(revision(2, 'Текст'));
    vi.mocked(changeArticleStatus).mockResolvedValue({ id: 7, title: 'Намаз', status: 'Draft' } as ArticleReadDto);

    renderPage();

    const returnButton = await screen.findByRole('button', { name: 'Вернуть автору' });
    expect((returnButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Комментарий автору'), { target: { value: 'Добавьте источники' } });
    fireEvent.click(returnButton);

    await waitFor(() => expect(changeArticleStatus).toHaveBeenCalledWith(7, 'Draft', 'Добавьте источники'));
    expect(await screen.findByText('Статья «Намаз» возвращена автору.')).toBeTruthy();
  });

  it('given an article no longer in the queue, when opened, then says so', async () => {
    vi.mocked(getReviewQueue).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Эта статья больше не ждёт проверки.')).toBeTruthy();
  });
});
