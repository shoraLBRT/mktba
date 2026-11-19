import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { locale } from '../../localization';
import { toApiError, translateApiError } from './apiError';

const axiosErrorWith = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data, statusText: '', headers: {}, config } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response);
};

describe('translateApiError', () => {
  it('given a known code, when translating, then returns its Russian message', () => {
    expect(translateApiError('article_not_found')).toBe('Статья не найдена.');
  });

  it('given a code with params, when translating, then interpolates them', () => {
    expect(translateApiError('paragraph_order_too_large', { maxOrder: 4 })).toBe(
      'Порядковый номер абзаца не может быть больше 4.',
    );
  });

  it('given an unknown or missing code, when translating, then returns the generic message', () => {
    expect(translateApiError('some_future_code')).toBe(locale.apiErrors.fallback);
    expect(translateApiError('constructor')).toBe(locale.apiErrors.fallback);
    expect(translateApiError(undefined)).toBe(locale.apiErrors.fallback);
  });
});

describe('toApiError', () => {
  it('given a 429 problem, when converting, then uses the Russian rate-limit message', () => {
    const error = toApiError(axiosErrorWith(429, { title: 'Too many requests. Try again later.', code: 'too_many_requests' }));

    expect(error.status).toBe(429);
    expect(error.message).toBe(locale.apiErrors.too_many_requests);
    expect(error.code).toBe('too_many_requests');
  });

  it('given a problem with params, when converting, then keeps the code and interpolates the params', () => {
    const error = toApiError(
      axiosErrorWith(400, {
        title: "School with slug 'hanafi' already exists.",
        status: 400,
        code: 'school_slug_taken',
        params: { slug: 'hanafi' },
        traceId: 'trace-1',
      }),
    );

    expect(error.message).toBe('Школа с идентификатором «hanafi» уже существует.');
    expect(error.params).toEqual({ slug: 'hanafi' });
    expect(error.traceId).toBe('trace-1');
  });

  it('given a body with English text and no code, when converting, then never shows the server text', () => {
    const error = toApiError(axiosErrorWith(400, { message: 'Invalid credentials.', title: 'Invalid credentials.' }));

    expect(error.status).toBe(400);
    expect(error.message).toBe(locale.apiErrors.fallback);
  });

  it('given no response, when converting, then reports the server as unreachable', () => {
    const config = { headers: new AxiosHeaders() };
    const error = toApiError(new AxiosError('Network Error', 'ERR_NETWORK', config));

    expect(error.status).toBeUndefined();
    expect(error.message).toBe(locale.apiErrors.network);
  });
});
