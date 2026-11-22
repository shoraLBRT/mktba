import { API_BASE_URL } from '../config';
import type { ClientErrorReportDto } from '../shared/types/ApiTypes';

/**
 * Browser error reports (X-05, #159): uncaught errors, unhandled promise rejections and errors caught
 * by an error boundary go to `POST /client-errors`, which cleans them and writes them to the server
 * log. A report names no reader: the message, the stack and the page's path (no query string, no
 * fragment), so no consent is asked. At most `MAX_REPORTS` per page load, each distinct error once;
 * off in development and in a browser driven by automation (`navigator.webdriver`: tests, e2e).
 * Cross-origin "Script error." carries nothing and is skipped. A failed request is not retried.
 */
export const CLIENT_ERRORS_URL = `${API_BASE_URL}/client-errors`;
export const MAX_REPORTS = 5;

type Kind = 'error' | 'rejection' | 'render';

let sent = 0;
const seen = new Set<string>();

const describe = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  return { message: typeof error === 'string' ? error : String(error) };
};

export const reportClientError = (kind: Kind, error: unknown): void => {
  if (typeof window === 'undefined' || import.meta.env.DEV || navigator.webdriver || sent >= MAX_REPORTS) return;

  const { message, stack } = describe(error);
  if (/^Script error\.?$/.test(message) || seen.has(message)) return;
  seen.add(message);
  sent++;

  const report: ClientErrorReportDto = {
    kind,
    message: message.slice(0, 1000),
    stack: stack?.slice(0, 4000),
    page: window.location.pathname,
  };
  fetch(CLIENT_ERRORS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
};

/** Called once by the browser entry. */
export const installClientErrorReporting = (): void => {
  window.addEventListener('error', (event) => reportClientError('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportClientError('rejection', event.reason));
};

/** Tests only: forget what was sent. */
export const resetClientErrorReporting = (): void => {
  sent = 0;
  seen.clear();
};
