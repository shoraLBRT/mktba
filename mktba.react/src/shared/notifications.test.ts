import { describe, expect, it } from 'vitest';
import notifications from '../localization/locales/ru/admin/notifications.json';
import { notificationHref, notificationText, unreadBadge } from './notifications';
import type { NotificationDto } from './types/ApiTypes';

const item = (patch: Partial<NotificationDto>): NotificationDto => ({
  id: 1,
  type: 'RemarkCreated',
  articleId: 7,
  articleTitle: 'Намаз путника',
  actorName: null,
  verdict: undefined,
  remarkStatus: undefined,
  excerpt: null,
  link: '/admin/articles/7/edit',
  createdAt: '2026-11-26T10:00:00Z',
  readAt: null,
  ...patch,
});

describe('notificationText', () => {
  it('words every type with the title, the verdict and the outcome', () => {
    expect(notificationText(item({ type: 'ArticleReviewed', verdict: 'HasErrors' }), notifications)).toBe(
      'Учёный оставил отметку «есть ошибки» к статье «Намаз путника».',
    );
    expect(notificationText(item({ type: 'RemarkClosed', remarkStatus: 'Resolved' }), notifications)).toBe(
      'Замечание к статье «Намаз путника» закрыто: исправлено.',
    );
    expect(notificationText(item({ type: 'ScholarApplicationApproved', articleId: null, articleTitle: null }), notifications)).toContain(
      'одобрили',
    );
    expect(notificationText(item({ type: 'ReReviewRequested', articleTitle: null }), notifications)).toContain('«статья удалена»');
  });
});

describe('notificationHref', () => {
  it('keeps a site-relative path and refuses anything that leaves the site', () => {
    expect(notificationHref(item({}))).toBe('/admin/articles/7/edit');
    expect(notificationHref(item({ link: '//evil.example/x' }))).toBeNull();
    expect(notificationHref(item({ link: 'https://evil.example' }))).toBeNull();
    expect(notificationHref(item({ link: '/\\evil.example' }))).toBeNull();
  });
});

describe('unreadBadge', () => {
  it('shows nothing for none and caps the number', () => {
    expect([unreadBadge(0), unreadBadge(3), unreadBadge(150)]).toEqual([null, '3', '99+']);
  });
});
