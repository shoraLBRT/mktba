import React, { useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { adminLogin, getAuthStatus } from '../../services/authService';
import { toApiError } from '../../shared/api-client/apiError';
import { Button } from '../../shared/ui/Button';
import { AccountCard, AccountField, FormAlert } from './AccountForm';
import { landingPathOf, linkClassName } from './account';

/**
 * `/login` (U-05, #126): the sign-in of every user, readers first; `/admin/login` stays for the
 * first admin and for registering with an invite. Signing in before confirming the address works.
 */
const ReaderLoginPage: React.FC = () => {
  const t = useLocale().account;
  const navigate = useNavigate();
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checked, setChecked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const status = useQuery({ queryKey: [APP_CONSTANTS.QUERY_KEYS.AUTH_STATUS], queryFn: getAuthStatus });
  const login = useMutation({
    mutationFn: adminLogin,
    onSuccess: (auth) => navigate(landingPathOf(auth.role)),
    onError: (error) => setFormError(toApiError(error).message),
  });

  const emailError = checked && !email.trim() ? t.errors.emailRequired : undefined;
  const passwordError = checked && !password ? t.errors.passwordRequired : undefined;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    setFormError(null);
    if (!email.trim()) {
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      passwordRef.current?.focus();
      return;
    }

    login.mutate({ email: email.trim(), password });
  };

  return (
    <AccountCard title={t.login.title} intro={t.login.intro}>
      <FormAlert message={formError} />
      <form className="space-y-4" noValidate onSubmit={submit}>
        <AccountField
          ref={emailRef}
          id={`${id}-email`}
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
        />
        <AccountField
          ref={passwordRef}
          id={`${id}-password`}
          label={t.passwordLabel}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="primary" type="submit" disabled={login.isPending}>
            {login.isPending ? t.busy : t.login.submit}
          </Button>
          <Link to="/reset-password" className={`text-sm ${linkClassName}`}>
            {t.login.forgotPassword}
          </Link>
        </div>
      </form>
      <div className="mt-6 space-y-2 border-t border-[var(--color-border-soft)] pt-4 text-sm text-[var(--color-ink-muted)]">
        {status.data?.readerSignUpEnabled ? (
          <p className="m-0">
            {t.login.noAccount}{' '}
            <Link to="/register" className={linkClassName}>
              {t.login.register}
            </Link>
          </p>
        ) : null}
        <p className="m-0">
          <Link to="/admin/login" className={linkClassName}>
            {t.login.invite}
          </Link>
        </p>
      </div>
    </AccountCard>
  );
};

export default ReaderLoginPage;
