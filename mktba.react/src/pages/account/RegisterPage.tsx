import React, { useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { getAuthStatus, signUp } from '../../services/authService';
import { toApiError, translateApiError } from '../../shared/api-client/apiError';
import { findPasswordProblem, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordFieldOfApiError } from '../../shared/password';
import { Button } from '../../shared/ui/Button';
import { AccountCard, AccountField, FormAlert, TrapField } from './AccountForm';
import { linkClassName } from './account';

type Field = 'email' | 'displayName' | 'password' | 'passwordConfirm';
const FIELDS: readonly Field[] = ['email', 'displayName', 'password', 'passwordConfirm'];

/** The API's refusals that belong to a field of the form. */
const fieldOfApiError = (code: string | undefined): Field | null => {
  if (code === 'email_invalid' || code === 'email_and_password_required') return 'email';
  if (code?.startsWith('profile_display_name')) return 'displayName';
  return passwordFieldOfApiError(code);
};

/**
 * `/register` (U-05, #126): a reader's own sign-up. It never creates an author (D3, #19). The answer
 * is the same for a known address, so the page always says to check the mail; it does not sign in.
 */
const RegisterPage: React.FC = () => {
  const t = useLocale().account;
  const id = useId();
  const focus = (field: Field) => document.getElementById(`${id}-${field}`)?.focus();
  const trapRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<Field, string>>({ email: '', displayName: '', password: '', passwordConfirm: '' });
  const [checked, setChecked] = useState(false);
  const [apiFieldError, setApiFieldError] = useState<{ field: Field; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const status = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS], queryFn: getAuthStatus });
  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: (_, payload) => setSentTo(payload.email),
    onError: (error) => {
      const apiError = toApiError(error);
      const field = fieldOfApiError(apiError.code);
      if (!field) {
        setFormError(apiError.message);
        return;
      }

      setApiFieldError({ field, message: apiError.message });
      focus(field);
    },
  });

  const problems: Partial<Record<Field, string>> = {};
  if (!values.email.trim()) problems.email = t.errors.emailRequired;
  if (!values.password) problems.password = t.errors.passwordRequired;
  else {
    const problem = findPasswordProblem(values.password, values.email.trim());
    if (problem) problems.password = translateApiError(problem, { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH });
  }
  if (values.passwordConfirm !== values.password) problems.passwordConfirm = t.errors.passwordMismatch;

  const errorOf = (field: Field) => (apiFieldError?.field === field ? apiFieldError.message : checked ? problems[field] : undefined);
  const change = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setApiFieldError(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    setFormError(null);
    setApiFieldError(null);
    const first = FIELDS.find((field) => problems[field]);
    if (first) {
      focus(first);
      return;
    }

    mutation.mutate({
      email: values.email.trim(),
      password: values.password,
      displayName: values.displayName.trim() || null,
      website: trapRef.current?.value ?? '',
    });
  };

  if (sentTo) {
    return (
      <AccountCard title={t.register.doneTitle} focusTitle>
        <p className="m-0 text-sm leading-6 text-[var(--color-ink-muted)]">{formatMessage(t.register.done, { email: sentTo })}</p>
        <p className="mb-0 mt-4 text-sm">
          <Link to="/login" className={linkClassName}>
            {t.register.doneLogin}
          </Link>
        </p>
      </AccountCard>
    );
  }

  if (status.data && !status.data.readerSignUpEnabled) {
    return (
      <AccountCard title={t.register.title}>
        <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.register.closed}</p>
      </AccountCard>
    );
  }

  return (
    <AccountCard title={t.register.title} intro={t.register.intro}>
      <FormAlert message={formError} />
      <form className="relative space-y-4" noValidate onSubmit={submit}>
        <AccountField
          id={`${id}-email`}
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={change('email')}
          error={errorOf('email')}
        />
        <AccountField
          id={`${id}-displayName`}
          label={t.displayNameLabel}
          autoComplete="nickname"
          maxLength={100}
          value={values.displayName}
          onChange={change('displayName')}
          hint={t.displayNameHint}
          error={errorOf('displayName')}
        />
        <AccountField
          id={`${id}-password`}
          label={t.passwordLabel}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={change('password')}
          hint={formatMessage(t.passwordHint, { min: PASSWORD_MIN_LENGTH })}
          error={errorOf('password')}
        />
        <AccountField
          id={`${id}-passwordConfirm`}
          label={t.passwordConfirmLabel}
          type="password"
          autoComplete="new-password"
          value={values.passwordConfirm}
          onChange={change('passwordConfirm')}
          error={errorOf('passwordConfirm')}
        />
        <TrapField ref={trapRef} id={`${id}-website`} label={t.trapLabel} />
        <div className="pt-2">
          <Button variant="primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t.busy : t.register.submit}
          </Button>
        </div>
      </form>
      <p className="mb-0 mt-6 border-t border-[var(--color-border-soft)] pt-4 text-sm text-[var(--color-ink-muted)]">
        {t.register.haveAccount}{' '}
        <Link to="/login" className={linkClassName}>
          {t.register.login}
        </Link>
      </p>
    </AccountCard>
  );
};

export default RegisterPage;
