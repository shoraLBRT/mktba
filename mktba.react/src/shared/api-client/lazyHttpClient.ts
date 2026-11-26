import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { readerLocale } from '../../localization';
import { ApiError } from './apiError';

/** The part of an axios instance the app calls. */
export type HttpClient = Pick<AxiosInstance, 'get' | 'post' | 'put' | 'delete' | 'request'>;

/**
 * An HTTP client whose axios instance is loaded on the first request (#321). axios is about 15 KB
 * gzip, and a reader's first view of an article sends no request from the browser (the server
 * renders it with its data), so axios stays out of the article page's first load
 * (`npm run size`). Every call waits for the same instance; when its chunk cannot be loaded (the
 * reader went offline) the call fails as a network error would and the next call tries again.
 */
export const lazyHttpClient = (load: () => Promise<AxiosInstance>): HttpClient => {
  let instance: Promise<AxiosInstance> | null = null;
  const client = (): Promise<AxiosInstance> => {
    instance ??= load().catch(() => {
      instance = null;
      throw new ApiError(readerLocale().apiErrors.network);
    });
    return instance;
  };

  return {
    get<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
      return client().then((http) => http.get<T, R, D>(url, config));
    },
    delete<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R> {
      return client().then((http) => http.delete<T, R, D>(url, config));
    },
    post<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
      return client().then((http) => http.post<T, R, D>(url, data, config));
    },
    put<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R> {
      return client().then((http) => http.put<T, R, D>(url, data, config));
    },
    request<T = unknown, R = AxiosResponse<T>, D = unknown>(config: AxiosRequestConfig<D>): Promise<R> {
      return client().then((http) => http.request<T, R, D>(config));
    },
  };
};
