import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { dictionaryFor } from '../../localization';
import { ApiError } from './apiError';
import { lazyHttpClient } from './lazyHttpClient';

describe('lazyHttpClient (#321)', () => {
  it('given several calls, when they run, then the axios instance is loaded once and serves them all', async () => {
    const get = vi.fn().mockResolvedValue({ data: 1 });
    const post = vi.fn().mockResolvedValue({ data: 2 });
    const load = vi.fn().mockResolvedValue({ get, post } as unknown as AxiosInstance);
    const client = lazyHttpClient(load);

    await expect(Promise.all([client.get('/a'), client.post('/b', { x: 1 }, { timeout: 5 })])).resolves.toEqual([{ data: 1 }, { data: 2 }]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/a', undefined);
    expect(post).toHaveBeenCalledWith('/b', { x: 1 }, { timeout: 5 });
  });

  it('given its chunk cannot be loaded, when a call is made, then it fails as a network error and the next call loads it again', async () => {
    const get = vi.fn().mockResolvedValue({ data: 'ok' });
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ get } as unknown as AxiosInstance);
    const client = lazyHttpClient(load);

    const failure = await client.get('/a').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe(dictionaryFor('ru').apiErrors.network);

    await expect(client.get('/a')).resolves.toEqual({ data: 'ok' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
