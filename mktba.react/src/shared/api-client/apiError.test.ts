import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { locale } from '../../localization';
import { toApiError } from './apiError';

const axiosErrorWith = (status: number, data: unknown) => {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data, statusText: '', headers: {}, config } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response);
};

describe('toApiError', () => {
  it('given a 429 response, when converting, then uses the Russian rate-limit message', () => {
    const error = toApiError(axiosErrorWith(429, { title: 'Too many requests. Try again later.', code: 'too_many_requests' }));

    expect(error.status).toBe(429);
    expect(error.message).toBe(locale.common.tooManyRequests);
    expect(error.code).toBe('too_many_requests');
  });

  it('given a 400 response with a message, when converting, then keeps the server message', () => {
    const error = toApiError(axiosErrorWith(400, { message: 'Неверный email или пароль.' }));

    expect(error.status).toBe(400);
    expect(error.message).toBe('Неверный email или пароль.');
  });
});
