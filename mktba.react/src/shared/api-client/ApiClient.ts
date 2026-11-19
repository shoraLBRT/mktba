import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../../config';
import { clearSession, getAccessToken, notifyAdminSessionExpired, refreshSession } from '../../services/session';
import { toApiError } from './apiError';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RetriableConfig = InternalAxiosRequestConfig & { _sessionRetried?: boolean };

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * A 401 means the access token expired or its session ended: renew it once through the refresh
 * cookie and repeat the request. When that fails too, the session is over.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const config = axios.isAxiosError(error) ? (error.config as RetriableConfig | undefined) : undefined;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    if (status === 401 && config && !config._sessionRetried) {
      config._sessionRetried = true;
      if (await refreshSession()) {
        return apiClient.request(config);
      }
    }

    const apiError = toApiError(error);
    if (apiError.status === 401) {
      clearSession();

      if (import.meta.env.DEV) {
        const traceSuffix = apiError.traceId ? ` TraceId: ${apiError.traceId}` : '';
        console.warn(`[auth] Admin session expired.${traceSuffix}`);
      }

      notifyAdminSessionExpired();
    }

    return Promise.reject(apiError);
  },
);

export default apiClient;
