import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LocalizationProvider } from '../../localization/provider';
import { decideScholarApplication, getScholarApplicationReview, getScholarApplications } from '../../services/scholarReviewService';
import type { ScholarApplicationReviewDto } from '../../shared/types/ApiTypes';
import AdminScholarReviewDetailPage from './AdminScholarReviewDetailPage';
import AdminScholarReviewPage from './AdminScholarReviewPage';

vi.mock('../../services/scholarReviewService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/scholarReviewService')>()),
  getScholarApplications: vi.fn(),
  getScholarApplicationReview: vi.fn(),
  decideScholarApplication: vi.fn(),
}));

vi.mock('../../services/scholarApplicationService', () => ({ downloadScholarDocument: vi.fn() }));

const applicant = { id: 5, email: 'reader@mktba.test', displayName: 'Абдулла', role: 'Reader' as const };

const pendingReview: ScholarApplicationReviewDto = {
  applicant,
  application: {
    id: 3,
    status: 'Pending',
    degree: 'Доктор наук',
    institution: 'Аль-Азхар',
    specialization: 'Фикх',
    mazhab: 'shafii',
    submittedAt: '2026-11-26T10:00:00Z',
    closedAt: null,
    documents: [{ id: 7, fileName: 'диплом.pdf', contentType: 'application/pdf', sizeBytes: 1200 }],
    decisionReason: null,
    revokedAt: null,
  },
  canApprove: true,
  canReject: true,
  canRevoke: false,
};

const reasonLabel = 'Причина (её увидит автор заявки)';

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/scholar-applications" element={<AdminScholarReviewPage />} />
            <Route path="/admin/scholar-applications/:applicationId" element={<AdminScholarReviewDetailPage />} />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.mocked(getScholarApplications).mockReset();
  vi.mocked(getScholarApplicationReview).mockReset();
  vi.mocked(decideScholarApplication).mockReset();
});

describe('AdminScholarReviewPage', () => {
  it('given pending applications, when the list opens, then it asks for the pending ones and the filter asks again', async () => {
    vi.mocked(getScholarApplications).mockResolvedValue({
      items: [
        {
          id: 3,
          status: 'Pending',
          applicant,
          degree: 'Доктор наук',
          institution: 'Аль-Азхар',
          specialization: 'Фикх',
          submittedAt: '2026-11-26T10:00:00Z',
          closedAt: null,
          documentCount: 2,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderAt('/admin/scholar-applications');

    const row = await screen.findByTestId('scholar-review-row-3');
    expect(row.textContent).toContain('Абдулла (reader@mktba.test)');
    expect(row.textContent).toContain('Доктор наук · Фикх');
    expect(within(row).getByRole('link', { name: 'Открыть заявку 3' }).getAttribute('href')).toBe('/admin/scholar-applications/3');
    expect(getScholarApplications).toHaveBeenCalledWith({ status: 'Pending', page: 1, pageSize: 20 });

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: '' } });
    await waitFor(() => expect(getScholarApplications).toHaveBeenLastCalledWith({ status: undefined, page: 1, pageSize: 20 }));
  });
});

describe('AdminScholarReviewDetailPage', () => {
  it('given a pending application, when the admin approves it after the confirmation, then the new status shows', async () => {
    vi.mocked(getScholarApplicationReview).mockResolvedValue(pendingReview);
    vi.mocked(decideScholarApplication).mockResolvedValue({
      ...pendingReview,
      applicant: { ...applicant, role: 'Scholar' },
      application: { ...pendingReview.application, status: 'Approved', closedAt: '2026-11-27T10:00:00Z' },
      canApprove: false,
      canReject: false,
      canRevoke: true,
    });
    renderAt('/admin/scholar-applications/3');

    expect(await screen.findByRole('button', { name: 'Скачать диплом.pdf' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Одобрить' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Одобрить' })).getByRole('button', { name: 'Да, одобрить' }));

    await waitFor(() => expect(screen.getByTestId('scholar-review-status').textContent).toBe('Одобрена'));
    expect(decideScholarApplication).toHaveBeenCalledWith(3, { kind: 'approve' });
    expect(screen.getByRole('button', { name: 'Отозвать статус учёного' })).toBeTruthy();
  });

  it('given a pending application, when the admin rejects it, then a reason is required before anything is sent', async () => {
    vi.mocked(getScholarApplicationReview).mockResolvedValue(pendingReview);
    vi.mocked(decideScholarApplication).mockResolvedValue({
      ...pendingReview,
      application: { ...pendingReview.application, status: 'Rejected', documents: [], decisionReason: 'Скан нечитаем.' },
      canApprove: false,
      canReject: false,
    });
    renderAt('/admin/scholar-applications/3');

    fireEvent.click(await screen.findByRole('button', { name: 'Отклонить' }));
    const group = screen.getByRole('group', { name: 'Отказ по заявке' });
    fireEvent.click(within(group).getByRole('button', { name: 'Подтвердить' }));
    expect(within(group).getByText('Укажите причину.')).toBeTruthy();
    expect(screen.getByLabelText(reasonLabel).getAttribute('aria-invalid')).toBe('true');
    expect(decideScholarApplication).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(reasonLabel), { target: { value: '  Скан нечитаем. ' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => expect(screen.getByTestId('scholar-review-status').textContent).toBe('Отклонена'));
    expect(decideScholarApplication).toHaveBeenCalledWith(3, { kind: 'reject', reason: 'Скан нечитаем.' });
    expect(screen.getByText('Скан нечитаем.')).toBeTruthy();
  });

  it('given an applicant whose role changed, when the application opens, then approval is not offered and the page says why', async () => {
    vi.mocked(getScholarApplicationReview).mockResolvedValue({ ...pendingReview, applicant: { ...applicant, role: 'Admin' }, canApprove: false });
    renderAt('/admin/scholar-applications/3');

    expect(await screen.findByTestId('scholar-review-role-changed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Одобрить' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeTruthy();
  });
});
