import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { LocalizationProvider } from '../../localization/provider';
import { adminLogin, confirmEmail, requestPasswordReset, resetPassword, signUp } from '../../services/authService';
import { ApiError, translateApiError } from '../../shared/api-client/apiError';
import { landingPathOf, tokenFromHash } from './account';
import ConfirmEmailPage from './ConfirmEmailPage';
import ReaderLoginPage from './ReaderLoginPage';
import RegisterPage from './RegisterPage';
import ResetPasswordPage from './ResetPasswordPage';

vi.mock('../../services/authService', () => ({
  adminLogin: vi.fn(),
  getAuthStatus: vi.fn(),
  signUp: vi.fn(),
  confirmEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

const PASSWORD = 'a long reader passphrase';

const renderAt = (page: ReactElement, signUpEnabled = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS], { requiresBootstrapAdmin: false, readerSignUpEnabled: signUpEnabled });
  return render(
    <QueryClientProvider client={client}>
      <LocalizationProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={page} />
            <Route path="/admin/profile" element={<p>profile-page</p>} />
            <Route path="/admin" element={<p>dashboard-page</p>} />
          </Routes>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('account helpers', () => {
  it('reads the token after #token= and nothing else', () => {
    expect(tokenFromHash('#token=abc_-1')).toBe('abc_-1');
    expect(tokenFromHash('#token=')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('sends a reader to the profile and everyone else to the dashboard', () => {
    expect(landingPathOf('Reader')).toBe('/admin/profile');
    expect(landingPathOf('Author')).toBe('/admin');
  });
});

describe('RegisterPage', () => {
  it('given filled fields, when sent, then it posts them with the trap value and says to check the mail', async () => {
    vi.mocked(signUp).mockResolvedValue();
    renderAt(<RegisterPage />);

    type('Email', ' reader@mktba.test ');
    type('Имя (необязательно)', 'Абдулла');
    type('Пароль', PASSWORD);
    type('Повторите пароль', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    const heading = await screen.findByRole('heading', { name: 'Проверьте почту' });
    expect(document.activeElement).toBe(heading);
    expect(vi.mocked(signUp).mock.calls[0][0]).toEqual({ email: 'reader@mktba.test', password: PASSWORD, displayName: 'Абдулла', website: '' });
    expect(screen.getByText(/reader@mktba\.test/)).toBeTruthy();
  });

  it('given different passwords, when sent, then nothing is posted and the repeat field says so', () => {
    renderAt(<RegisterPage />);

    type('Email', 'reader@mktba.test');
    type('Пароль', PASSWORD);
    type('Повторите пароль', 'something else entirely');
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(signUp).not.toHaveBeenCalled();
    const repeat = screen.getByLabelText('Повторите пароль');
    expect(document.activeElement).toBe(repeat);
    expect(repeat.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Пароли не совпадают.')).toBeTruthy();
  });

  it('given the API refuses the address, when sent, then its message is shown at the email field', async () => {
    vi.mocked(signUp).mockRejectedValue(new ApiError(translateApiError('email_invalid'), 400, 'email_invalid'));
    renderAt(<RegisterPage />);

    type('Email', 'reader@mktba');
    type('Пароль', PASSWORD);
    type('Повторите пароль', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')));
    expect(screen.getByText(translateApiError('email_invalid'))).toBeTruthy();
  });

  it('given sign-up is closed, when opened, then it says so and shows no form', () => {
    renderAt(<RegisterPage />, false);

    expect(screen.getByText('Регистрация пока закрыта.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Зарегистрироваться' })).toBeNull();
  });
});

describe('ReaderLoginPage', () => {
  it('given a reader, when signed in, then they land on their profile', async () => {
    vi.mocked(adminLogin).mockResolvedValue({ accessToken: 't', expiresAtUtc: '2026-11-26T12:00:00Z', email: 'r@mktba.test', role: 'Reader' });
    renderAt(<ReaderLoginPage />);

    type('Email', 'r@mktba.test');
    type('Пароль', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('profile-page')).toBeTruthy();
    expect(vi.mocked(adminLogin).mock.calls[0][0]).toEqual({ email: 'r@mktba.test', password: PASSWORD });
  });

  it('links to the reset and, while sign-up is open, to the registration', () => {
    renderAt(<ReaderLoginPage />);

    expect(screen.getByRole('link', { name: 'Забыли пароль?' }).getAttribute('href')).toBe('/reset-password');
    expect(screen.getByRole('link', { name: 'Зарегистрироваться' }).getAttribute('href')).toBe('/register');
  });
});

describe('ConfirmEmailPage', () => {
  it('given a link with a token, when opened, then it confirms once and takes the token out of the address', async () => {
    window.history.replaceState(null, '', '/confirm-email#token=raw-token');
    vi.mocked(confirmEmail).mockResolvedValue();
    renderAt(<ConfirmEmailPage />);

    expect(await screen.findByRole('heading', { name: 'Адрес подтверждён' })).toBeTruthy();
    expect(confirmEmail).toHaveBeenCalledTimes(1);
    expect(confirmEmail).toHaveBeenCalledWith('raw-token');
    expect(window.location.hash).toBe('');
  });

  it('given a used link, when opened, then the refusal is shown', async () => {
    window.history.replaceState(null, '', '/confirm-email#token=used');
    vi.mocked(confirmEmail).mockRejectedValue(new ApiError(translateApiError('account_token_invalid'), 400, 'account_token_invalid'));
    renderAt(<ConfirmEmailPage />);

    expect((await screen.findByRole('alert')).textContent).toContain(translateApiError('account_token_invalid'));
  });

  it('given a link without a token, when opened, then nothing is posted', () => {
    renderAt(<ConfirmEmailPage />);

    expect(screen.getByRole('alert').textContent).toContain('В ссылке нет кода подтверждения');
    expect(confirmEmail).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordPage', () => {
  it('given no token, when an address is sent, then the answer does not tell whether it has an account', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue();
    renderAt(<ResetPasswordPage />);

    type('Email', 'someone@mktba.test');
    fireEvent.click(screen.getByRole('button', { name: 'Прислать ссылку' }));

    expect(await screen.findByText(/Если на someone@mktba\.test есть аккаунт/)).toBeTruthy();
    expect(vi.mocked(requestPasswordReset).mock.calls[0][0]).toEqual({ email: 'someone@mktba.test', website: '' });
  });

  it('given the request form is open, when the link is opened in the same tab, then the new-password form takes its token', async () => {
    renderAt(<ResetPasswordPage />);
    expect(screen.getByRole('button', { name: 'Прислать ссылку' })).toBeTruthy();

    window.history.replaceState(null, '', '/reset-password#token=same-tab');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(await screen.findByRole('button', { name: 'Сохранить пароль' })).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('given the link of the email, when a new password is set, then it posts the token and says to sign in', async () => {
    window.history.replaceState(null, '', '/reset-password#token=reset-token');
    vi.mocked(resetPassword).mockResolvedValue();
    renderAt(<ResetPasswordPage />);

    type('Новый пароль', 'a brand new passphrase');
    type('Повторите пароль', 'a brand new passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));

    const heading = await screen.findByRole('heading', { name: 'Пароль изменён' });
    expect(document.activeElement).toBe(heading);
    expect(vi.mocked(resetPassword).mock.calls[0][0]).toEqual({ token: 'reset-token', password: 'a brand new passphrase' });
    expect(window.location.hash).toBe('');
  });
});
