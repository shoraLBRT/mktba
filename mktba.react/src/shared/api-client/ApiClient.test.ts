import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  clearSession,
  getSessionState,
  setSignedIn,
  startSession,
} from '../../services/session';
import sessionAxios from '../../services/sessionHttp';
import apiClient from './ApiClient';
import axiosClient from './axiosClient';
import { ApiError } from './apiError';

const reply = (config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> => {
  const response: AxiosResponse = { data, status, statusText: '', headers: {}, config };
  return status < 400
    ? Promise.resolve(response)
    : Promise.reject(new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, response));
};

/** The API: protected calls pass only with `validToken`; refresh answers with `refreshStatus`. */
const fakeApi = (options: { validToken: string; refreshStatus: number; newToken?: string }) => {
  const seenTokens: (string | undefined)[] = [];
  const api: AxiosAdapter = (config) => {
    const token = String(config.headers.Authorization ?? '').replace('Bearer ', '') || undefined;
    seenTokens.push(token);
    return token === options.validToken
      ? reply(config, 200, { ok: true })
      : reply(config, 401, { code: 'unauthorized' });
  };
  const refresh = vi.fn<AxiosAdapter>((config) =>
    options.refreshStatus === 0
      ? Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config))
      : reply(config, options.refreshStatus, { accessToken: options.newToken, email: 'admin@mktba.test' }));
  axiosClient.defaults.adapter = api;
  sessionAxios.defaults.adapter = refresh;
  return { seenTokens, refresh };
};

describe('ApiClient session refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  afterEach(() => {
    axiosClient.defaults.adapter = undefined;
    sessionAxios.defaults.adapter = undefined;
  });

  it('given an expired access token, when a request gets 401, then it refreshes once and repeats the request with the new token', async () => {
    setSignedIn({ accessToken: 'expired', email: 'admin@mktba.test' });
    const { seenTokens, refresh } = fakeApi({ validToken: 'fresh', refreshStatus: 200, newToken: 'fresh' });

    const response = await apiClient.get('/users');

    expect(response.data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0][0].withCredentials).toBe(true);
    expect(refresh.mock.calls[0][0].headers['X-Requested-With']).toBe('mktba');
    expect(seenTokens).toEqual(['expired', 'fresh']);
    expect(getSessionState().accessToken).toBe('fresh');
  });

  it('given several requests failing with 401 at once, when they recover, then they share a single refresh', async () => {
    setSignedIn({ accessToken: 'expired', email: 'admin@mktba.test' });
    const { refresh } = fakeApi({ validToken: 'fresh', refreshStatus: 200, newToken: 'fresh' });

    await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('given an ended session, when the refresh is refused, then the request fails with 401, the session is cleared and the expiry is announced', async () => {
    setSignedIn({ accessToken: 'expired', email: 'admin@mktba.test' });
    const { refresh } = fakeApi({ validToken: 'fresh', refreshStatus: 401 });
    const expired = vi.fn();
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, expired);

    const failure = await apiClient.get('/users').catch((error: unknown) => error);

    window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, expired);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getSessionState().accessToken).toBeNull();
    expect(localStorage.getItem('mktba.signedIn')).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('given a renewed token the API still rejects, when the repeated request gets 401, then it does not refresh again', async () => {
    setSignedIn({ accessToken: 'expired', email: 'admin@mktba.test' });
    const { seenTokens, refresh } = fakeApi({ validToken: 'never', refreshStatus: 200, newToken: 'fresh' });

    await expect(apiClient.get('/users')).rejects.toBeInstanceOf(ApiError);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seenTokens).toEqual(['expired', 'fresh']);
  });

});

describe('startSession', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSession();
  });

  afterEach(() => {
    sessionAxios.defaults.adapter = undefined;
  });

  it('given tokens left in storage by an older version, when the app starts, then they are removed', async () => {
    localStorage.setItem('mktba.admin.token', 'old');
    localStorage.setItem('wikiweaver.admin.token', 'older');

    await startSession();

    expect(localStorage.getItem('mktba.admin.token')).toBeNull();
    expect(localStorage.getItem('wikiweaver.admin.token')).toBeNull();
  });

  it('given a browser that never signed in, when the app starts, then it does not call the API', async () => {
    const { refresh } = fakeApi({ validToken: 'fresh', refreshStatus: 200, newToken: 'fresh' });

    expect(await startSession()).toBe(false);

    expect(refresh).not.toHaveBeenCalled();
    expect(getSessionState().restoring).toBe(false);
  });

  it('given a browser that signed in before, when the page reloads, then the session is restored from the refresh cookie', async () => {
    localStorage.setItem('mktba.signedIn', '1');
    fakeApi({ validToken: 'fresh', refreshStatus: 200, newToken: 'fresh' });

    const restoring = startSession();
    expect(getSessionState().restoring).toBe(true);

    expect(await restoring).toBe(true);
    expect(getSessionState()).toEqual({ accessToken: 'fresh', email: 'admin@mktba.test', restoring: false });
  });

  it('given the API is unreachable on reload, when the restore fails, then the browser still counts as signed in for the next reload', async () => {
    localStorage.setItem('mktba.signedIn', '1');
    fakeApi({ validToken: 'fresh', refreshStatus: 0 });

    expect(await startSession()).toBe(false);

    expect(getSessionState()).toEqual({ accessToken: null, email: null, restoring: false });
    expect(localStorage.getItem('mktba.signedIn')).toBe('1');
  });

  it('given an ended session, when the page reloads, then the browser stops counting as signed in', async () => {
    localStorage.setItem('mktba.signedIn', '1');
    fakeApi({ validToken: 'fresh', refreshStatus: 401 });

    expect(await startSession()).toBe(false);

    expect(localStorage.getItem('mktba.signedIn')).toBeNull();
  });
});
