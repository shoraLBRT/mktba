import axios from 'axios';
import { useSyncExternalStore } from 'react';
import { API_BASE_URL } from '../config';
import type { AdminAuthResponseDto } from '../shared/types/ApiTypes';

/**
 * The signed-in session (U-03). The access token lives only in memory; the refresh token is an
 * httpOnly cookie the browser sends to `/auth/*`, so a reload restores the session through
 * `POST /auth/refresh` and no script can read either token from storage.
 */
export type SessionState = {
  accessToken: string | null;
  email: string | null;
  /** True until the first restore attempt after a page load has finished. */
  restoring: boolean;
};

export const ADMIN_SESSION_EXPIRED_EVENT = 'mktba:admin-session-expired';

/** Not a secret: only remembers that this browser signed in, so anonymous readers never call /auth/refresh. */
const SIGNED_IN_HINT_KEY = 'mktba.signedIn';

/** Where access tokens were kept before U-03; removed on startup. */
const LEGACY_TOKEN_KEYS = ['mktba.admin.token', 'wikiweaver.admin.token'];

const REFRESH_LOCK = 'mktba-session-refresh';

/**
 * Calls that carry the refresh cookie. They bypass the API client's interceptors (a failed refresh
 * must not trigger another refresh) and send the header the API requires as a CSRF guard.
 */
export const sessionHttp = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'mktba' },
});

const readHint = (): boolean => {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
};

const writeHint = (signedIn: boolean): void => {
  try {
    if (signedIn) {
      localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    } else {
      localStorage.removeItem(SIGNED_IN_HINT_KEY);
    }
  } catch {
    // Storage blocked: the session still works, a reload just asks the API once more.
  }
};

const ANONYMOUS: SessionState = { accessToken: null, email: null, restoring: false };

let state: SessionState = ANONYMOUS;
const listeners = new Set<() => void>();

const setState = (next: SessionState): void => {
  state = next;
  listeners.forEach((listener) => listener());
};

export const getSessionState = (): SessionState => state;

export const getAccessToken = (): string | null => state.accessToken;

export const subscribeSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The current session; re-renders when it changes. The server renders every page anonymously, and
 * so does the hydrating browser, which then switches to its own session.
 */
export const useSession = (): SessionState =>
  useSyncExternalStore(subscribeSession, getSessionState, () => ANONYMOUS);

/** Keeps the tokens of a login, register or refresh answer. */
export const setSignedIn = (auth: Pick<AdminAuthResponseDto, 'accessToken' | 'email'>): void => {
  writeHint(true);
  setState({ accessToken: auth.accessToken, email: auth.email, restoring: false });
};

/** Forgets the session locally (the cookie is the API's to clear). */
export const clearSession = (): void => {
  writeHint(false);
  setState({ accessToken: null, email: null, restoring: false });
};

export const notifyAdminSessionExpired = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
};

/** Runs `task` while no other tab of this site refreshes, so two tabs never spend the same refresh token. */
const exclusive = <T>(task: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? // The lock resolves with the task's own result; lib.dom types it as a nested promise.
      (navigator.locks.request(REFRESH_LOCK, task) as Promise<T>)
    : task();

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request.
 * Resolves false when there is no live session (the local session is then cleared) or the API
 * cannot be reached (the session is kept, so a network blip does not sign the user out).
 */
export const refreshSession = (): Promise<boolean> => {
  refreshInFlight ??= exclusive(async () => {
    try {
      const response = await sessionHttp.post<AdminAuthResponseDto>('/auth/refresh');
      setSignedIn(response.data);
      return true;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 401 || status === 403) {
        clearSession();
      } else {
        setState({ ...state, restoring: false });
      }
      return false;
    }
  }).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};

/** Ends this device's session on the API and locally; a failed call still signs out locally. */
export const logOut = async (): Promise<void> => {
  await sessionHttp.post('/auth/logout').catch(() => undefined);
  clearSession();
};

/** On page load: drops tokens older versions kept in storage and restores the session from the cookie. */
export const startSession = (): Promise<boolean> => {
  try {
    LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was stored there either.
  }

  if (!readHint()) {
    return Promise.resolve(false);
  }

  setState({ ...state, restoring: true });
  return refreshSession();
};
