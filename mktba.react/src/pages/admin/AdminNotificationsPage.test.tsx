import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '../../components/admin/NotificationBell';
import { LocalizationProvider } from '../../localization/provider';
import {
  getNotificationSettings,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationSettings,
} from '../../services/notificationService';
import type { NotificationDto, NotificationPageDto } from '../../shared/types/ApiTypes';
import AdminNotificationsPage from './AdminNotificationsPage';
import { NotificationSettingsCard } from './NotificationSettingsCard';

vi.mock('../../services/notificationService', () => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
}));

const list = vi.mocked(getNotifications);

const item = (patch: Partial<NotificationDto>): NotificationDto => ({
  id: 1,
  type: 'RemarkCreated',
  articleId: 7,
  articleTitle: 'Намаз путника',
  actorName: 'Ахмад',
  excerpt: 'Нужен источник.',
  link: '/admin/articles/7/edit',
  createdAt: '2026-11-26T10:00:00Z',
  readAt: null,
  ...patch,
});

const page = (items: NotificationDto[], unread: number): NotificationPageDto => ({ items, total: items.length, unread, page: 1, pageSize: 20 });

const renderWith = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );

describe('AdminNotificationsPage', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue(
      page(
        [
          item({}),
          item({ id: 2, type: 'ArticleReviewed', verdict: 'Confirmed', excerpt: null, readAt: '2026-11-26T11:00:00Z' }),
          item({ id: 3, type: 'ScholarApplicationApproved', articleId: null, articleTitle: null, actorName: null, excerpt: null, link: '/admin/scholar-application' }),
        ],
        2,
      ),
    );
    vi.mocked(markNotificationRead).mockReset().mockResolvedValue();
    vi.mocked(markAllNotificationsRead).mockReset().mockResolvedValue();
  });

  it('given notifications, when the page opens, then each reads as a sentence with its link, excerpt and actor, the unread marked', async () => {
    renderWith(<AdminNotificationsPage />);

    const remark = await screen.findByRole('link', { name: 'Новое замечание учёного к статье «Намаз путника».' });
    expect(remark.getAttribute('href')).toBe('/admin/articles/7/edit');
    expect(screen.getByText('«Нужен источник.»')).toBeTruthy();
    expect(screen.getByTestId('notification-1').textContent).toContain('Ахмад');
    expect(screen.getByTestId('notification-1').textContent).toContain('новое');
    expect(screen.getByTestId('notification-2').textContent).not.toContain('новое');
    expect(screen.getByRole('link', { name: 'Учёный оставил отметку «подтверждаю» к статье «Намаз путника».' })).toBeTruthy();
    expect(screen.getByTestId('notifications-unread').textContent).toBe('Непрочитанных: 2');
  });

  it('given unread notifications, when one is marked read and then all, then the API is asked and the list is read again', async () => {
    renderWith(<AdminNotificationsPage />);
    await screen.findByTestId('notification-1');

    fireEvent.click(screen.getByRole('button', { name: /^Прочитано: Новое замечание/ }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith(1, expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Отметить все прочитанными' }));
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(screen.getByRole('button', { name: 'Непрочитанные' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ unread: true, page: 1 }));
  });

  it('given an unread notification, when its link is followed, then it is marked read', async () => {
    renderWith(<AdminNotificationsPage />);

    fireEvent.click(await screen.findByRole('link', { name: /^Заявку на статус учёного одобрили/ }));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith(3, expect.anything()));
  });

  it('given nothing, when the page opens, then says so', async () => {
    list.mockResolvedValue(page([], 0));
    renderWith(<AdminNotificationsPage />);

    expect(await screen.findByText('Уведомлений пока нет.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Отметить все прочитанными' }).matches(':disabled')).toBe(true);
  });
});

describe('NotificationBell', () => {
  it('given unread notifications, when the header renders, then the bell shows their number and leads to the list', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(3);
    renderWith(<NotificationBell />);

    const bell = await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 3' });
    expect(bell.getAttribute('href')).toBe('/admin/notifications');
    expect(bell.textContent).toBe('3');
  });

  it('given none unread, when the header renders, then the bell has no number', async () => {
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(0);
    renderWith(<NotificationBell />);

    await waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Уведомления' }).textContent).toBe('');
  });
});

describe('NotificationSettingsCard', () => {
  it('given the defaults, when a category is switched off and saved, then the choice is sent and the missing mail server is said', async () => {
    vi.mocked(getNotificationSettings).mockResolvedValue({
      emailScholarApplication: true,
      emailArticleReviews: true,
      emailRemarks: true,
      emailsSent: false,
    });
    vi.mocked(updateNotificationSettings).mockResolvedValue({
      emailScholarApplication: true,
      emailArticleReviews: true,
      emailRemarks: false,
      emailsSent: false,
    });
    renderWith(<NotificationSettingsCard />);

    const remarks = (await screen.findByLabelText('Замечания учёных и ответы в них')) as HTMLInputElement;
    expect(remarks.checked).toBe(true);
    expect(screen.getByText(/почтовый сервер не настроен/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сохранить' }).matches(':disabled')).toBe(true);

    fireEvent.click(remarks);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(updateNotificationSettings).toHaveBeenCalledWith(
        { emailScholarApplication: true, emailArticleReviews: true, emailRemarks: false },
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Настройки уведомлений сохранены')).toBeTruthy();
  });
});
