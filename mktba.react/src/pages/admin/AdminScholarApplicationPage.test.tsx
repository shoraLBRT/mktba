import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import {
  downloadScholarDocument,
  getMyScholarApplication,
  submitScholarApplication,
  withdrawScholarApplication,
} from '../../services/scholarApplicationService';
import type { ScholarApplicationDto } from '../../shared/types/ApiTypes';
import AdminScholarApplicationPage from './AdminScholarApplicationPage';

vi.mock('../../services/scholarApplicationService', () => ({
  getMyScholarApplication: vi.fn(),
  submitScholarApplication: vi.fn(),
  withdrawScholarApplication: vi.fn(),
  downloadScholarDocument: vi.fn(),
}));

const pending: ScholarApplicationDto = {
  id: 3,
  status: 'Pending',
  degree: 'Доктор наук',
  institution: 'Аль-Азхар',
  specialization: 'Фикх',
  mazhab: 'shafii',
  submittedAt: '2026-11-26T10:00:00Z',
  closedAt: null,
  documents: [{ id: 7, fileName: 'диплом.pdf', contentType: 'application/pdf', sizeBytes: 1200 }],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <AdminScholarApplicationPage />
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const pickFiles = (files: File[]) =>
  fireEvent.change(screen.getByTestId('scholar-documents-file'), { target: { files } });

afterEach(() => {
  cleanup();
  vi.mocked(getMyScholarApplication).mockReset();
  vi.mocked(submitScholarApplication).mockReset();
  vi.mocked(withdrawScholarApplication).mockReset();
  vi.mocked(downloadScholarDocument).mockReset();
});

describe('AdminScholarApplicationPage', () => {
  it('given a reader without an application, when they fill the form and send it, then the pending application replaces the form', async () => {
    vi.mocked(getMyScholarApplication).mockResolvedValue({ canApply: true, application: undefined });
    vi.mocked(submitScholarApplication).mockResolvedValue(pending);
    renderPage();

    fireEvent.change(await screen.findByLabelText('Учёная степень или звание'), { target: { value: 'Доктор наук' } });
    fireEvent.change(screen.getByLabelText('Учебное заведение'), { target: { value: 'Аль-Азхар' } });
    fireEvent.change(screen.getByLabelText('Специализация'), { target: { value: 'Фикх' } });
    fireEvent.change(screen.getByLabelText('Мазхаб'), { target: { value: 'shafii' } });
    pickFiles([new File(['%PDF-1.7'], 'диплом.pdf', { type: 'application/pdf' })]);
    expect(within(screen.getByTestId('scholar-picked-documents')).getByText('диплом.pdf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отправить заявку' }));

    await waitFor(() => expect(screen.getByTestId('scholar-application-status').textContent).toBe('Ждёт проверки'));
    const draft = vi.mocked(submitScholarApplication).mock.calls[0][0];
    expect(draft).toMatchObject({ degree: 'Доктор наук', institution: 'Аль-Азхар', specialization: 'Фикх', mazhab: 'shafii' });
    expect(draft.documents.map((file) => file.name)).toEqual(['диплом.pdf']);
    expect(screen.queryByRole('form', { name: 'Новая заявка' })).toBeNull();
    expect(screen.getByText('Шафиитский')).toBeTruthy();
  });

  it('given a form without documents, when sent, then the page asks for one and sends nothing', async () => {
    vi.mocked(getMyScholarApplication).mockResolvedValue({ canApply: true, application: undefined });
    renderPage();

    fireEvent.change(await screen.findByLabelText('Учёная степень или звание'), { target: { value: 'Магистр' } });
    fireEvent.change(screen.getByLabelText('Учебное заведение'), { target: { value: 'Институт' } });
    fireEvent.change(screen.getByLabelText('Специализация'), { target: { value: 'Хадисы' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Новая заявка' }));

    expect(await screen.findByText('Приложите хотя бы один документ.')).toBeTruthy();
    expect(submitScholarApplication).not.toHaveBeenCalled();
  });

  it('given a pending application, when it is withdrawn after the confirmation, then the form comes back', async () => {
    vi.mocked(getMyScholarApplication).mockResolvedValue({ canApply: false, application: pending });
    vi.mocked(withdrawScholarApplication).mockResolvedValue({
      canApply: true,
      application: { ...pending, status: 'Withdrawn', closedAt: '2026-11-26T11:00:00Z', documents: [] },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Отозвать заявку' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, отозвать' }));

    await waitFor(() => expect(screen.getByTestId('scholar-application-status').textContent).toBe('Отозвана'));
    expect(screen.getByText('Документов нет: они удалены вместе с отзывом заявки.')).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Новая заявка' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Отозвать заявку' })).toBeNull();
  });

  it('given a document, when its download is clicked, then it is fetched with the session and saved under its name', async () => {
    vi.mocked(getMyScholarApplication).mockResolvedValue({ canApply: false, application: pending });
    vi.mocked(downloadScholarDocument).mockResolvedValue(new Blob(['%PDF-1.7']));
    const createObjectURL = vi.fn(() => 'blob:document');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Скачать диплом.pdf' }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(downloadScholarDocument).toHaveBeenCalledWith(7);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('диплом.pdf');
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:document'));
    click.mockRestore();
  });

  it('given a scholar without an application, when the page opens, then it explains who applies and shows no form', async () => {
    vi.mocked(getMyScholarApplication).mockResolvedValue({ canApply: false, application: undefined });
    renderPage();

    expect(await screen.findByTestId('scholar-role-note')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Новая заявка' })).toBeNull();
  });
});
