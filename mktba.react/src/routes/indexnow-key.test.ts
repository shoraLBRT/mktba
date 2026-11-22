import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from './indexnow-key';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('indexnow-key.txt loader', () => {
  it('given IndexNow is configured in the API, when the key file is requested, then serves the key as plain text', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ key: 'test-indexnow-key-0123' }));

    const response = await loader();

    expect(String(fetch.mock.calls[0][0])).toContain('/seo/indexnow-key');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('test-indexnow-key-0123');
  });

  it('given IndexNow is off, when the key file is requested, then answers 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: 'indexnow_not_configured' }, 404));

    await expect(loader()).rejects.toMatchObject({ status: 404 });
  });

  it('given the API is down, when the key file is requested, then answers 503 so crawlers retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(loader()).rejects.toMatchObject({ status: 503 });
  });
});
