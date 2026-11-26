import { formatMessage, readerLocale } from '../../localization';
import { isAxiosError } from './axiosError';

type ProblemPayload = {
  code?: unknown;
  params?: unknown;
  traceId?: unknown;
};

type MessageParams = Record<string, string | number>;

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly params?: MessageParams;
  readonly traceId?: string;

  constructor(message: string, status?: number, code?: string, traceId?: string, params?: MessageParams) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.params = params;
    this.traceId = traceId;
  }
}

const extractString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const extractParams = (value: unknown): MessageParams | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const messageOf = (messages: Record<string, string> | undefined, code: string | undefined): string | undefined =>
  code && messages && Object.hasOwn(messages, code) ? messages[code] : undefined;

/**
 * The message for an API error code in the reader's language (`apiErrors` in
 * locales/<lang>/shared.json; `readerLocale()`). Unknown or missing codes get a generic message:
 * server text is never shown to users. The codes only the admin's calls return are in the lazy
 * `admin` chunk (`adminApiErrors`, locales/ru/admin/adminApiErrors.json, #321), which the admin
 * loads before it renders, so the public first load carries only the codes a reader can meet.
 */
export const translateApiError = (code: string | undefined, params?: MessageParams): string => {
  const locale = readerLocale();
  const adminMessages: Record<string, string> | undefined = locale.adminApiErrors;
  const template = messageOf(locale.apiErrors, code) ?? messageOf(adminMessages, code) ?? locale.apiErrors.fallback;
  return params ? formatMessage(template, params) : template;
};

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (isAxiosError(error)) {
    if (!error.response) {
      return new ApiError(readerLocale().apiErrors.network);
    }

    const payload: ProblemPayload =
      error.response.data && typeof error.response.data === 'object' ? (error.response.data as ProblemPayload) : {};
    const code = extractString(payload.code);
    const params = extractParams(payload.params);
    return new ApiError(
      translateApiError(code, params),
      error.response.status,
      code,
      extractString(payload.traceId),
      params,
    );
  }

  if (error instanceof Error) {
    return new ApiError(error.message);
  }

  return new ApiError(readerLocale().common.unknownError);
};

export const extractApiErrorMessage = (error: unknown): string => toApiError(error).message;
