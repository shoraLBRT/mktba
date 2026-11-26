import React from 'react';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { adminSectionPath } from '../../layouts/adminSections';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getUnreadNotificationCount } from '../../services/notificationService';
import { NOTIFICATION_POLL_MS, unreadBadge } from '../../shared/notifications';

/**
 * The bell in the admin header (V-09, #125): a link to the notifications with the unread count,
 * asked for again every minute while the admin is open and on returning to the tab.
 */
export const NotificationBell: React.FC = () => {
  const t = useLocale().notifications;
  const countQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.NOTIFICATIONS_UNREAD],
    queryFn: getUnreadNotificationCount,
    refetchInterval: NOTIFICATION_POLL_MS,
  });
  const count = countQuery.data ?? 0;
  const badge = unreadBadge(count);
  const label = badge ? formatMessage(t.bellUnread, { count }) : t.bell;

  return (
    <Link
      to={adminSectionPath('notifications')}
      data-testid="notification-bell"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-brand-forest)]"
      title={label}
      aria-label={label}
    >
      <Bell size={16} />
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -inset-e-0.5 min-w-[18px] rounded-full bg-[var(--color-brand-forest)] px-1 text-center text-[10px] font-semibold leading-[18px] text-white"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
};
