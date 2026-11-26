import { lazyHttpClient } from './lazyHttpClient';

/**
 * The API client: the axios instance of `axiosClient.ts` (token, session refresh, translated
 * errors), loaded on the first request so axios is not in the public first load (#321).
 */
const apiClient = lazyHttpClient(() => import('./axiosClient').then((module) => module.default));

export default apiClient;
