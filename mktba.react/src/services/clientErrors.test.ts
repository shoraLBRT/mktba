import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ERRORS_URL, MAX_REPORTS, reportClientError, resetClientErrorReporting } from './clientErrors';

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));

const sentBodies = () =>
  (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(init.body as string));

beforeEach(() => {
  resetClientErrorReporting();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('DEV', false);
  window.history.replaceState(null, '', '/namaz?q=secret#part');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('reportClientError (X-05)', () => {
  it('given an error, when reported, then posts its message, stack and the page path only', () => {
    const error = new TypeError('x is undefined');

    reportClientError('rejection', error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe(CLIENT_ERRORS_URL);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
    expect(sentBodies()[0]).toEqual({
      kind: 'rejection',
      message: 'TypeError: x is undefined',
      stack: error.stack?.slice(0, 4000),
      page: '/namaz',
    });
  });

  it('given the same error twice, when reported, then sends it once', () => {
    reportClientError('error', new Error('boom'));
    reportClientError('error', new Error('boom'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('given many distinct errors, when reported, then stops after the per-page cap', () => {
    for (let i = 0; i < MAX_REPORTS + 3; i++) reportClientError('error', new Error(`boom ${i}`));

    expect(fetchMock).toHaveBeenCalledTimes(MAX_REPORTS);
  });

  it('given a cross-origin script error or a non-Error value, when reported, then skips the first and stringifies the second', () => {
    reportClientError('error', 'Script error.');
    reportClientError('rejection', 42);

    expect(sentBodies()).toEqual([{ kind: 'rejection', message: '42', page: '/namaz' }]);
  });

  it('given development or an automated browser, when reported, then sends nothing', () => {
    vi.stubEnv('DEV', true);
    reportClientError('error', new Error('dev'));
    vi.stubEnv('DEV', false);
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    try {
      reportClientError('error', new Error('e2e'));
    } finally {
      Reflect.deleteProperty(navigator, 'webdriver');
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('given the request fails, when reported, then nothing is thrown', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));

    expect(() => reportClientError('error', new Error('boom'))).not.toThrow();
    await Promise.resolve();
  });
});
