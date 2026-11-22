import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { LocalizationProvider } from '../localization/provider';
import { adminLogin, adminRegister } from '../services/authService';
import { ApiError, translateApiError } from '../shared/api-client/apiError';
import AdminLoginPage from './AdminLoginPage';

vi.mock('../services/authService', () => ({ adminLogin: vi.fn(), adminRegister: vi.fn(), getAuthStatus: vi.fn() }));
const adminLoginMock = vi.mocked(adminLogin);
const adminRegisterMock = vi.mocked(adminRegister);

const signedIn = { accessToken: 'token', expiresAtUtc: '2026-11-22T12:00:00Z', email: 'admin@mktba.test', role: 'Admin' as const };

const renderPage = (requiresBootstrapAdmin = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS], { requiresBootstrapAdmin });

  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter>
          <AdminLoginPage />
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

const field = (label: string) => screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const describedText = (input: HTMLElement) =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' | ');

const openRegistration = () => fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться по приглашению' }));
const submitRegistration = () => fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

describe('AdminLoginPage', () => {
  beforeEach(() => {
    adminLoginMock.mockReset().mockResolvedValue(signedIn);
    adminRegisterMock.mockReset().mockResolvedValue(signedIn);
  });

  it('given the sign-in form, when it is empty and submitted, then the email field is marked, described and focused', () => {
    renderPage();
    expect(screen.queryByLabelText('Повторите пароль')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    const email = field('Email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(email)).toBe('Укажите email.');
    expect(field('Пароль').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
    expect(adminLoginMock).not.toHaveBeenCalled();
  });

  it('given an old short password, when signing in, then it is sent as is: the new-password rules do not apply', async () => {
    renderPage();
    type('Email', 'old@mktba.test');
    type('Пароль', 'short1');

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(adminLoginMock).toHaveBeenCalled());
    expect(adminLoginMock.mock.calls[0][0]).toEqual({ email: 'old@mktba.test', password: 'short1' });
  });

  it('given registration, when the password is short, then the hint and the error describe the focused password field', () => {
    renderPage();
    openRegistration();
    type('Email', 'first@mktba.test');
    type('Пароль', 'short-pass');
    type('Повторите пароль', 'short-pass');

    submitRegistration();

    const password = field('Пароль');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(password)).toBe(
      'Не короче 12 символов. Подойдёт фраза из нескольких слов. | Пароль должен быть не короче 12 символов.',
    );
    expect(document.activeElement).toBe(password);
    expect(adminRegisterMock).not.toHaveBeenCalled();
  });

  it('given registration, when the confirmation differs, then the confirmation field is marked and focused', () => {
    renderPage();
    openRegistration();
    type('Email', 'first@mktba.test');
    type('Пароль', 'correct horse battery');
    type('Повторите пароль', 'correct horse batery');

    submitRegistration();

    const confirm = field('Повторите пароль');
    expect(confirm.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(confirm)).toBe('Пароли не совпадают.');
    expect(document.activeElement).toBe(confirm);
    expect(field('Пароль').getAttribute('aria-invalid')).toBeNull();

    type('Повторите пароль', 'correct horse battery');
    expect(confirm.getAttribute('aria-invalid')).toBeNull();
  });

  it('given registration by invite, when everything is valid, then the password is sent once, without the confirmation', async () => {
    renderPage(false);
    openRegistration();
    type('Email', ' author@mktba.test ');
    type('Пароль', 'correct horse battery');
    type('Повторите пароль', 'correct horse battery');
    type('Код приглашения', ' invite-token ');

    submitRegistration();

    await waitFor(() => expect(adminRegisterMock).toHaveBeenCalled());
    expect(adminRegisterMock.mock.calls[0][0]).toEqual({
      email: 'author@mktba.test',
      password: 'correct horse battery',
      inviteToken: 'invite-token',
    });
  });

  it('given the API refuses the password, when registering, then its message is shown at the password field', async () => {
    adminRegisterMock.mockRejectedValue(
      new ApiError(translateApiError('password_too_simple'), 400, 'password_too_simple'),
    );
    renderPage();
    openRegistration();
    type('Email', 'first@mktba.test');
    type('Пароль', 'correct horse battery');
    type('Повторите пароль', 'correct horse battery');

    submitRegistration();

    const password = field('Пароль');
    await waitFor(() => expect(password.getAttribute('aria-invalid')).toBe('true'));
    expect(describedText(password)).toContain('Пароль слишком простой');
    expect(document.activeElement).toBe(password);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
