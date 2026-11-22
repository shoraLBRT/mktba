import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The queue lives in the module: each case imports it afresh. */
const loadEvents = async () => {
  vi.resetModules();
  return import('./events');
};

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));

const sentBatches = () =>
  fetchMock.mock.calls.map((call) => {
    const [, init] = call as unknown as [string, RequestInit];
    return JSON.parse(init.body as string).events as Array<Record<string, unknown>>;
  });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/zakyat');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('own analytics events', () => {
  it('given no answer or a declined consent, when events are tracked, then nothing is sent', async () => {
    const events = await loadEvents();
    events.trackEvent({ type: 'ArticleView', articleId: 1 });
    localStorage.setItem('mktba.consent', 'false');
    events.trackEvent({ type: 'ArticleView', articleId: 1 });

    vi.advanceTimersByTime(events.FLUSH_DELAY_MS);
    events.flushEvents();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('given consent, when events are tracked, then they go together after the delay, with one view id per page', async () => {
    localStorage.setItem('mktba.consent', 'true');
    const events = await loadEvents();

    events.trackEvent({ type: 'ArticleView', articleId: 7 });
    events.trackEvent({ type: 'ScrollDepth', articleId: 7, scrollDepth: 25 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(events.FLUSH_DELAY_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(events.ANALYTICS_EVENTS_URL);
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
    const [batch] = sentBatches();
    expect(batch.map((event) => event.type)).toEqual(['ArticleView', 'ScrollDepth']);
    expect(batch[0].viewId).toEqual(expect.any(String));
    expect(batch[1].viewId).toBe(batch[0].viewId);
  });

  it('given another page, when an event is tracked there, then it carries a new view id', async () => {
    localStorage.setItem('mktba.consent', 'true');
    const events = await loadEvents();

    events.trackEvent({ type: 'ArticleView', articleId: 1 });
    window.history.replaceState(null, '', '/salat');
    events.trackEvent({ type: 'ArticleView', articleId: 2 });
    events.flushEvents();

    const [batch] = sentBatches();
    expect(batch[1].viewId).not.toBe(batch[0].viewId);
  });

  it('given a full batch, when one more event is tracked, then the full batch goes at once and the rest waits', async () => {
    localStorage.setItem('mktba.consent', 'true');
    const events = await loadEvents();

    for (let i = 0; i < events.MAX_EVENTS_PER_REQUEST + 1; i++) {
      events.trackEvent({ type: 'Search', query: `запрос ${i}` });
    }

    expect(sentBatches().map((batch) => batch.length)).toEqual([events.MAX_EVENTS_PER_REQUEST]);
    vi.advanceTimersByTime(events.FLUSH_DELAY_MS);
    expect(sentBatches().map((batch) => batch.length)).toEqual([events.MAX_EVENTS_PER_REQUEST, 1]);
  });

  it('given waiting events, when the page is left, then they are sent without waiting for the delay', async () => {
    localStorage.setItem('mktba.consent', 'true');
    const events = await loadEvents();

    events.trackEvent({ type: 'InternalLinkClick', articleId: 3, targetPath: '/salat' });
    window.dispatchEvent(new Event('pagehide'));

    expect(sentBatches()).toEqual([[expect.objectContaining({ type: 'InternalLinkClick', targetPath: '/salat' })]]);
  });

  it('given the API is unreachable, when events are sent, then the failure is swallowed', async () => {
    localStorage.setItem('mktba.consent', 'true');
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    const events = await loadEvents();

    events.trackEvent({ type: 'ArticleView', articleId: 1 });

    expect(() => events.flushEvents()).not.toThrow();
    await vi.runAllTimersAsync();
  });
});
