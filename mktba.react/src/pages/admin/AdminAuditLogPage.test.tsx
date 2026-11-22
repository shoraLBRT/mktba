import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getAuditLog } from '../../services/auditLog/auditLogService';
import type { AuditLogEntryDto, AuditLogPageDto } from '../../shared/types/ApiTypes';
import AdminAuditLogPage from './AdminAuditLogPage';

vi.mock('../../services/auditLog/auditLogService', () => ({
  getAuditLog: vi.fn(),
  auditLogQueryKey: (filter: unknown) => ['adminAuditLog', filter],
}));

const admin = { id: 1, email: 'admin@mktba.test', displayName: 'Админ' };

const entry = (id: number, patch: Partial<AuditLogEntryDto>): AuditLogEntryDto => ({
  id,
  occurredAt: '2026-11-22T10:00:00Z',
  action: 'ArticleStatusChanged',
  actorId: 1,
  actor: admin,
  articleId: null,
  articleTitle: null,
  articleAvailable: false,
  targetUserId: null,
  targetUser: undefined,
  fromValue: null,
  toValue: null,
  ...patch,
});

const pageOf = (items: AuditLogEntryDto[], patch: Partial<AuditLogPageDto> = {}): AuditLogPageDto => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
  ...patch,
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminAuditLogPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.mocked(getAuditLog).mockReset();
});

describe('AdminAuditLogPage', () => {
  it('given entries, when the page opens, then it shows who did what to which article or user', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(pageOf([
      entry(3, { action: 'ArticleStatusChanged', articleId: 10, articleTitle: 'Намаз', articleAvailable: true, fromValue: 'InReview', toValue: 'Published' }),
      entry(2, { action: 'ArticlePurged', articleId: 11, articleTitle: 'Старая' }),
      entry(1, { action: 'UserRoleChanged', targetUserId: 5, targetUser: { id: 5, email: 'author@mktba.test', displayName: null }, fromValue: 'Reader', toValue: 'Author' }),
    ]));

    renderPage();

    const published = await screen.findByTestId('audit-row-3');
    expect(within(published).getByText('Админ (admin@mktba.test)')).toBeTruthy();
    expect(within(published).getByText('Смена статуса')).toBeTruthy();
    expect(within(published).getByRole('link', { name: 'Намаз' }).getAttribute('href')).toBe('/admin/articles/10/edit');
    expect(within(published).getByText('На проверке → Опубликована')).toBeTruthy();

    const purged = screen.getByTestId('audit-row-2');
    expect(within(purged).getByText('Удаление навсегда')).toBeTruthy();
    expect(within(purged).getByText('Старая (нет на сайте)')).toBeTruthy();
    expect(within(purged).queryByRole('link')).toBeNull();

    const role = screen.getByTestId('audit-row-1');
    expect(within(role).getByText('author@mktba.test')).toBeTruthy();
    expect(within(role).getByText('Читатель → Автор')).toBeTruthy();
    expect(screen.getByText('1–3 из 3')).toBeTruthy();
  });

  it('given an entry by a deleted user, when shown, then the user is named by id', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(pageOf([
      entry(1, { action: 'ArticleTrashed', actorId: 7, actor: undefined, articleId: 10, articleTitle: 'Статья' }),
    ]));

    renderPage();

    expect(await screen.findByText('Пользователь #7 (удалён)')).toBeTruthy();
  });

  it('given a filter and a second page, when chosen, then the log is asked for them', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(pageOf([entry(1, {})], { total: 120 }));

    renderPage();
    await screen.findByTestId('audit-row-1');

    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    await waitFor(() => expect(getAuditLog).toHaveBeenLastCalledWith({ page: 2, pageSize: 50 }));

    fireEvent.change(screen.getByLabelText('Действие'), { target: { value: 'UserRoleChanged' } });
    await waitFor(() => expect(getAuditLog).toHaveBeenLastCalledWith({ action: 'UserRoleChanged', page: 1, pageSize: 50 }));
  });

  it('given an empty log, when the page opens, then it says so', async () => {
    vi.mocked(getAuditLog).mockResolvedValue(pageOf([]));

    renderPage();

    expect(await screen.findByText('Записей нет.')).toBeTruthy();
  });
});
