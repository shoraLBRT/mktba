import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * Calls that carry the refresh cookie. They bypass the API client's interceptors (a failed refresh
 * must not trigger another refresh) and send the header the API requires as a CSRF guard. Loaded on
 * the first such call (`sessionHttp` in `session.ts`, #321).
 */
const sessionAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'mktba' },
});

export default sessionAxios;
