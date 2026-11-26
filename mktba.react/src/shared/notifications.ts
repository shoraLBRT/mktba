import { formatMessage } from '../localization/format';
import type { Locale } from '../localization';
import type { NotificationDto } from './types/ApiTypes';

type NotificationStrings = Locale['notifications'];

/** How often the header's bell asks for the unread count, while the admin is open (V-09, #125). */
export const NOTIFICATION_POLL_MS = 60_000;

/** The counter on the bell: up to 99, then «99+». */
export const unreadBadge = (count: number): string | null => (count <= 0 ? null : count > 99 ? '99+' : String(count));

/** The notification as one sentence, worded from its type and fields. */
export const notificationText = (item: NotificationDto, t: NotificationStrings): string => {
  const title = item.articleTitle?.trim() || t.articleMissing;
  return formatMessage(t.text[item.type], {
    title,
    verdict: item.verdict ? t.verdict[item.verdict] : '',
    outcome: item.remarkStatus ? t.outcome[item.remarkStatus] : '',
  });
};

/**
 * Where a notification leads: its own site-relative admin path. Anything else (an absolute URL, a
 * protocol-relative `//host`) is refused, so a stored link can never send the user off the site.
 */
export const notificationHref = (item: NotificationDto): string | null =>
  /^\/(?!\/)[^\s\\]*$/.test(item.link) ? item.link : null;
