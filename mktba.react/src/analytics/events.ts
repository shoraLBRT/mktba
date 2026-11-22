import { API_BASE_URL } from '../config';
import type { AnalyticsEventDto } from '../shared/types/ApiTypes';
import { getConsent } from './metrika';

/**
 * The site's own reader events (N-02, #96; decision D7, #88): `POST /analytics/events`, the table
 * behind the author's and the admin's dashboards. Sent only with the same consent as Metrika
 * (`mktba.consent`): without it — tests, e2e, declined or undecided visitors — every call is a
 * no-op, and so is a browser driven by automation (`navigator.webdriver`). Nothing in an event names
 * the reader; `viewId` is a random id made anew for every page (path) the visitor opens and never
 * stored in the browser; `visitorId` (N-03, #97) is a random id kept in `localStorage`
 * (`mktba.visitor`) for the current UTC day only and replaced the next day, so repeated views of
 * a day can be told from new readers and nothing links one day to another.
 *
 * Events are queued and sent together a few seconds later, when 50 are waiting, or when the page
 * is hidden or left (`keepalive`, so the request outlives the page). A failed request is not retried.
 */
export const ANALYTICS_EVENTS_URL = `${API_BASE_URL}/analytics/events`;
export const MAX_EVENTS_PER_REQUEST = 50;
export const FLUSH_DELAY_MS = 3000;

export const VISITOR_KEY = 'mktba.visitor';

export type AnalyticsEventInput = Omit<AnalyticsEventDto, 'viewId' | 'visitorId'>;

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

/** Stored as `<UTC date> <uuid>`: an id of another day is replaced, never reused. */
const currentVisitorId = (): string | undefined => {
  const day = new Date().toISOString().slice(0, 10);
  const [storedDay, id] = (localStorage.getItem(VISITOR_KEY) ?? '').split(' ');
  if (storedDay === day && id) return id;
  const fresh = globalThis.crypto?.randomUUID?.();
  if (fresh) localStorage.setItem(VISITOR_KEY, `${day} ${fresh}`);
  return fresh;
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
  if (typeof window === 'undefined' || navigator.webdriver || getConsent() !== true) return;

  queue.push({ ...event, viewId: currentViewId(), visitorId: currentVisitorId() });
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

