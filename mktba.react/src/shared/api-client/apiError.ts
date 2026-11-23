import axios from 'axios';
import { formatMessage, readerLocale } from '../../localization';

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

/**
 * The message for an API error code in the reader's language (`apiErrors` in
 * locales/<lang>/shared.json; `readerLocale()`). Unknown or missing codes get a generic message:
 * server text is never shown to users.
 */
export const translateApiError = (code: string | undefined, params?: MessageParams): string => {
  const apiErrorMessages: Record<string, string> = readerLocale().apiErrors;
  const template =
    code && Object.hasOwn(apiErrorMessages, code) ? apiErrorMessages[code] : apiErrorMessages.fallback;
  return params ? formatMessage(template, params) : template;
};

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
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
