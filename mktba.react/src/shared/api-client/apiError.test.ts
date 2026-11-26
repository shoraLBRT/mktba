import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { dictionaryFor } from '../../localization';
import adminApiErrors from '../../localization/locales/ru/admin/adminApiErrors.json';
import enShared from '../../localization/locales/en/shared.json';
import ruShared from '../../localization/locales/ru/shared.json';
import { toApiError, translateApiError } from './apiError';

const ru = dictionaryFor('ru');
const en = dictionaryFor('en');

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

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
    expect(translateApiError('some_future_code')).toBe(ru.apiErrors.fallback);
    expect(translateApiError('constructor')).toBe(ru.apiErrors.fallback);
    expect(translateApiError(undefined)).toBe(ru.apiErrors.fallback);
  });
});

describe('toApiError', () => {
  it('given a 429 problem, when converting, then uses the Russian rate-limit message', () => {
    const error = toApiError(axiosErrorWith(429, { title: 'Too many requests. Try again later.', code: 'too_many_requests' }));

    expect(error.status).toBe(429);
    expect(error.message).toBe(ru.apiErrors.too_many_requests);
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
    expect(error.message).toBe(ru.apiErrors.fallback);
  });

  it('given no response, when converting, then reports the server as unreachable', () => {
    const config = { headers: new AxiosHeaders() };
    const error = toApiError(new AxiosError('Network Error', 'ERR_NETWORK', config));

    expect(error.status).toBeUndefined();
    expect(error.message).toBe(ru.apiErrors.network);
  });
});

describe('the reader language', () => {
  it('given an English page, when translating and converting, then the messages are English', () => {
    window.history.replaceState(null, '', '/en/search');
    const config = { headers: new AxiosHeaders() };

    expect(translateApiError('article_not_found')).toBe('Article not found.');
    expect(translateApiError('some_future_code')).toBe(en.apiErrors.fallback);
    expect(toApiError(new AxiosError('Network Error', 'ERR_NETWORK', config)).message).toBe(en.apiErrors.network);
    expect(toApiError(42).message).toBe(en.common.unknownError);
  });

  it('given a page back in Russian, when translating, then the messages are Russian again', () => {
    window.history.replaceState(null, '', '/en/');
    expect(translateApiError('article_not_found')).toBe('Article not found.');

    window.history.replaceState(null, '', '/zakyat');
    expect(translateApiError('article_not_found')).toBe('Статья не найдена.');
  });
});

// #321: the public first load carries only the codes a reader can meet; the admin's are in the lazy
// `admin` chunk (locales/ru/admin/adminApiErrors.json).
describe('API error dictionaries', () => {
  const publicCodes = (language: 'ru' | 'en') =>
    Object.keys((language === 'ru' ? ruShared : enShared).apiErrors);

  it.each(['ru', 'en'] as const)('given the %s public dictionary, when compared with the admin codes, then none of them is in it', (language) => {
    const leaked = Object.keys(adminApiErrors).filter((code) => publicCodes(language).includes(code));
    expect(leaked).toEqual([]);
  });

  it('given the codes of the reader pages (sign-in, register, reset, invites, feedback, article, search), when looked up, then they are public', () => {
    const readerCodes = [
      'fallback', 'network', 'too_many_requests', 'invalid_credentials', 'email_invalid', 'reader_sign_up_closed',
      'password_too_short', 'password_too_long', 'password_too_simple', 'account_token_invalid', 'account_token_expired',
      'email_not_confirmed', 'invite_not_found', 'invite_expired', 'invite_used', 'invite_revoked', 'admin_already_exists',
      'profile_display_name_required', 'profile_display_name_invalid', 'feedback_type_invalid', 'feedback_text_required',
      'feedback_text_too_long', 'feedback_contact_too_long', 'feedback_limit_reached', 'article_not_found', 'article_gone',
      'tag_not_found', 'author_not_found', 'search_query_too_short', 'search_query_too_long',
    ];
    for (const language of ['ru', 'en'] as const) {
      expect(readerCodes.filter((code) => !publicCodes(language).includes(code))).toEqual([]);
    }
  });

  it('given an admin code, when the admin chunk is loaded, then it is translated', () => {
    expect(translateApiError('scholar_application_not_found')).toBe(adminApiErrors.scholar_application_not_found);
    expect(translateApiError('scholar_application_not_found')).not.toBe(ru.apiErrors.fallback);
  });
});
