import React, { useId, useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { formatMessage } from '../localization';
import { useLocale } from '../localization/hooks';
import { adminLogin, adminRegister, getAuthStatus } from '../services/authService';
import { toApiError, translateApiError } from '../shared/api-client/apiError';
import {
  findPasswordProblem,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordFieldOfApiError,
  type PasswordProblem,
} from '../shared/password';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';
import { Input } from '../shared/ui/Input';

type FormValues = {
  email: string;
  password: string;
  passwordConfirm: string;
  inviteToken: string;
};

type FieldKey = keyof FormValues;
/** A key of `adminLoginPage.errors`, or a new-password rule named by its API error code. */
type FieldProblem = 'emailRequired' | 'passwordRequired' | 'passwordMismatch' | 'inviteTokenRequired' | PasswordProblem;

const labelClassName = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

const AdminLoginPage: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminLoginPage;
  const featureCards = t.featureCards as Array<[string, string]>;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({ email: '', password: '', passwordConfirm: '', inviteToken: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Field problems are shown from the first submit on, then follow every edit (as on the profile page).
  const [checked, setChecked] = useState(false);
  const [apiFieldError, setApiFieldError] = useState<{ key: FieldKey; message: string } | null>(null);
  const fieldId = useId();
  const idOf = (key: FieldKey) => `${fieldId}-${key}`;

  const statusQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS],
    queryFn: getAuthStatus,
  });

  const loginMutation = useMutation({
    mutationFn: adminLogin,
    onSuccess: () => {
      navigate('/admin');
    },
    onError: (error) => setErrorMessage((error as Error).message),
  });

  const registerMutation = useMutation({
    mutationFn: adminRegister,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS] });
      navigate('/admin');
    },
    onError: (error) => {
      const apiError = toApiError(error);
      const key = passwordFieldOfApiError(apiError.code);
      if (!key) {
        setErrorMessage(apiError.message);
        return;
      }

      setApiFieldError({ key, message: apiError.message });
      document.getElementById(idOf(key))?.focus();
    },
  });

  const requiresInvite = !statusQuery.data?.requiresBootstrapAdmin;
  const isBusy = loginMutation.isPending || registerMutation.isPending;

  // Signing in checks only that the fields are filled: the new-password rules do not apply to old passwords.
  const problems: Partial<Record<FieldKey, FieldProblem>> = {};
  if (!formValues.email.trim()) problems.email = 'emailRequired';
  if (!formValues.password.trim()) problems.password = 'passwordRequired';
  else if (isRegisterMode) {
    const passwordProblem = findPasswordProblem(formValues.password, formValues.email);
    if (passwordProblem) problems.password = passwordProblem;
  }
  if (isRegisterMode && formValues.passwordConfirm !== formValues.password) problems.passwordConfirm = 'passwordMismatch';
  if (isRegisterMode && requiresInvite && !formValues.inviteToken.trim()) problems.inviteToken = 'inviteTokenRequired';

  const errorOf = (key: FieldKey): string | undefined => {
    if (apiFieldError?.key === key) return apiFieldError.message;
    const problem = checked ? problems[key] : undefined;
    if (!problem) return undefined;
    return problem.startsWith('password_')
      ? translateApiError(problem, { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
      : t.errors[problem as keyof typeof t.errors];
  };
  /** The id, `aria-invalid` and `aria-describedby` of a field; the password's hint describes it in registration. */
  const fieldA11y = (key: FieldKey) => {
    const error = errorOf(key);
    const describedBy = [
      key === 'password' && isRegisterMode ? `${idOf(key)}-hint` : null,
      error ? `${idOf(key)}-error` : null,
    ].filter(Boolean);
    return {
      id: idOf(key),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy.length ? describedBy.join(' ') : undefined,
    };
  };
  const fieldError = (key: FieldKey) => {
    const error = errorOf(key);
    return error ? (
      <span id={`${idOf(key)}-error`} className="mt-1 block text-xs font-medium text-red-700">
        {error}
      </span>
    ) : null;
  };
  const change = (key: FieldKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setFormValues((current) => ({ ...current, [key]: value }));
    setApiFieldError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setApiFieldError(null);
    setChecked(true);

    const firstProblem = (['email', 'password', 'passwordConfirm', 'inviteToken'] as const).find((key) => problems[key]);
    if (firstProblem) {
      document.getElementById(idOf(firstProblem))?.focus();
      return;
    }

    if (isRegisterMode) {
      registerMutation.mutate({
        email: formValues.email.trim(),
        password: formValues.password,
        inviteToken: formValues.inviteToken.trim() || undefined,
      });
      return;
    }

    loginMutation.mutate({
      email: formValues.email.trim(),
      password: formValues.password,
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-var(--layout-header-height)-3rem)] items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <Card className="w-full max-w-5xl overflow-hidden border border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.96)] shadow-[0_28px_90px_rgba(28,27,24,0.10)]">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-[var(--color-border-soft)] bg-[linear-gradient(135deg,rgba(45,106,79,0.13),rgba(244,243,238,0.5))] px-6 py-8 lg:border-b-0 lg:border-e lg:px-8 lg:py-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-forest)]">{t.heroEyebrow}</p>
            <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
              {isRegisterMode ? t.registerTitle : t.loginTitle}
            </h1>
            <p className="mb-0 mt-4 max-w-md text-sm leading-7 text-[var(--color-ink-muted)]">
              {locale.brand.adminLoginDescription}
            </p>

            <div className="mt-8 space-y-3">
              {featureCards.map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                  <p className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">{title}</p>
                  <p className="mb-0 mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-8 lg:px-8 lg:py-10">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">
                  {isRegisterMode ? t.registerAction : t.loginAction}
                </p>
                <p className="mb-0 mt-1 text-xs text-[var(--color-ink-subtle)]">{t.sessionHint}</p>
              </div>
            </div>

            {isRegisterMode && !requiresInvite ? (
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                {t.firstAdminHint}
              </div>
            ) : null}

            {statusQuery.isLoading ? (
              <div className="mb-4 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-muted)]">
                {t.authStatusLoading}
              </div>
            ) : null}

            {errorMessage ? (
              <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <form className="space-y-4" noValidate onSubmit={submit}>
              <div>
                <label htmlFor={idOf('email')} className={labelClassName}>
                  {t.emailLabel}
                </label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
                  <Input
                    {...fieldA11y('email')}
                    type="email"
                    autoComplete="email"
                    value={formValues.email}
                    onChange={change('email')}
                    className="h-12 ps-10"
                  />
                </div>
                {fieldError('email')}
              </div>

              <div>
                <label htmlFor={idOf('password')} className={labelClassName}>
                  {t.passwordLabel}
                </label>
                <div className="relative">
                  <LockKeyhole size={16} className="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
                  <Input
                    {...fieldA11y('password')}
                    type="password"
                    autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                    value={formValues.password}
                    onChange={change('password')}
                    className="h-12 ps-10"
                  />
                </div>
                {isRegisterMode ? (
                  <span id={`${idOf('password')}-hint`} className="mt-1 block text-xs text-[var(--color-ink-subtle)]">
                    {formatMessage(t.passwordHint, { min: PASSWORD_MIN_LENGTH })}
                  </span>
                ) : null}
                {fieldError('password')}
              </div>

              {isRegisterMode ? (
                <div>
                  <label htmlFor={idOf('passwordConfirm')} className={labelClassName}>
                    {t.passwordConfirmLabel}
                  </label>
                  <div className="relative">
                    <LockKeyhole size={16} className="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-subtle)]" />
                    <Input
                      {...fieldA11y('passwordConfirm')}
                      type="password"
                      autoComplete="new-password"
                      value={formValues.passwordConfirm}
                      onChange={change('passwordConfirm')}
                      className="h-12 ps-10"
                    />
                  </div>
                  {fieldError('passwordConfirm')}
                </div>
              ) : null}

              {isRegisterMode && requiresInvite ? (
                <div>
                  <label htmlFor={idOf('inviteToken')} className={labelClassName}>
                    {t.inviteTokenLabel}
                  </label>
                  <Input {...fieldA11y('inviteToken')} value={formValues.inviteToken} onChange={change('inviteToken')} className="h-12" />
                  {fieldError('inviteToken')}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="primary" type="submit" disabled={isBusy}>
                  {isBusy ? '...' : isRegisterMode ? t.registerAction : t.loginAction}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setApiFieldError(null);
                    setChecked(false);
                    setIsRegisterMode((state) => !state);
                  }}
                >
                  {isRegisterMode ? t.haveAccount : t.createAccount}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AdminLoginPage;
