import { API_BASE_URL } from '../config';
import type { AnalyticsEventDto } from '../shared/types/ApiTypes';
import { getConsent } from './metrika';

/**
 * The site's own reader events (N-02, #96; decision D7, #88): `POST /analytics/events`, the table
 * behind the author's and the admin's dashboards. Sent only with the same consent as Metrika
 * (`mktba.consent`): without it — tests, e2e, declined or undecided visitors — every call is a
 * no-op. Nothing in an event names the reader; `viewId` is a random id made anew for every page
 * (path) the visitor opens and never stored in the browser.
 *
 * Events are queued and sent together a few seconds later, when 50 are waiting, or when the page
 * is hidden or left (`keepalive`, so the request outlives the page). A failed request is not retried.
 */
export const ANALYTICS_EVENTS_URL = `${API_BASE_URL}/analytics/events`;
export const MAX_EVENTS_PER_REQUEST = 50;
export const FLUSH_DELAY_MS = 3000;

export type AnalyticsEventInput = Omit<AnalyticsEventDto, 'viewId'>;

const queue: AnalyticsEventDto[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let view: { path: string; id: string | undefined } | null = null;

const currentViewId = (): string | undefined => {
  const path = window.location.pathname;
  if (view?.path !== path) {
    view = { path, id: globalThis.crypto?.randomUUID?.() };
  }
  return view.id;
};

export const flushEvents = (): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  while (queue.length > 0) {
    const events = queue.splice(0, MAX_EVENTS_PER_REQUEST);
    fetch(ANALYTICS_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => undefined);
  }
};

const flushWhenHidden = () => {
  if (document.visibilityState === 'hidden') flushEvents();
};

export const trackEvent = (event: AnalyticsEventInput): void => {
  if (typeof window === 'undefined' || getConsent() !== true) return;

  queue.push({ ...event, viewId: currentViewId() });
  if (!listening) {
    listening = true;
    window.addEventListener('pagehide', flushEvents);
    document.addEventListener('visibilitychange', flushWhenHidden);
  }

  if (queue.length >= MAX_EVENTS_PER_REQUEST) {
    flushEvents();
  } else {
    timer ??= setTimeout(flushEvents, FLUSH_DELAY_MS);
  }
};

