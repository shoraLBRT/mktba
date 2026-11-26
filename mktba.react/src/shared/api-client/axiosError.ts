import type { AxiosError } from 'axios';

/**
 * `axios.isAxiosError` without importing axios, so code in the public first load can tell an HTTP
 * error apart while axios itself loads on the first request (#321): axios marks its errors with
 * `isAxiosError: true`, the same check axios makes.
 */
export const isAxiosError = <T = unknown>(error: unknown): error is AxiosError<T> =>
  typeof error === 'object' && error !== null && (error as { isAxiosError?: unknown }).isAxiosError === true;
