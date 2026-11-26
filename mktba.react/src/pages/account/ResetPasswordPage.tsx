import React, { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { requestPasswordReset, resetPassword } from '../../services/authService';
import { clearSession } from '../../services/session';
import { toApiError, translateApiError } from '../../shared/api-client/apiError';
import { findPasswordProblem, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordFieldOfApiError } from '../../shared/password';
import { Button } from '../../shared/ui/Button';
import { AccountCard, AccountField, FormAlert, TrapField } from './AccountForm';
import { linkClassName, tokenFromHash } from './account';

/** The request: an address to send the link to. The answer does not tell whether it has an account. */
const RequestForm: React.FC = () => {
  const t = useLocale().account;
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const trapRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [checked, setChecked] = useState(false);
  const [apiEmailError, setApiEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: (_, payload) => setSentTo(payload.email),
    onError: (error) => {
      const apiError = toApiError(error);
      if (apiError.code === 'email_invalid' || apiError.code === 'email_and_password_required') {
        setApiEmailError(apiError.message);
        emailRef.current?.focus();
      } else {
        setFormError(apiError.message);
      }
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    setFormError(null);
    setApiEmailError(null);
    if (!email.trim()) {
      emailRef.current?.focus();
      return;
    }

    mutation.mutate({ email: email.trim(), website: trapRef.current?.value ?? '' });
  };

  if (sentTo) {
    return (
      <AccountCard title={t.reset.requestDoneTitle} focusTitle>
        <p className="m-0 text-sm leading-6 text-[var(--color-ink-muted)]">{formatMessage(t.reset.requestDone, { email: sentTo })}</p>
        <p className="mb-0 mt-4 text-sm">
          <Link to="/login" className={linkClassName}>
            {t.reset.toLogin}
          </Link>
        </p>
      </AccountCard>
    );
  }

  return (
    <AccountCard title={t.reset.requestTitle} intro={t.reset.requestIntro}>
      <FormAlert message={formError} />
      <form className="relative space-y-4" noValidate onSubmit={submit}>
        <AccountField
          ref={emailRef}
          id={`${id}-email`}
          label={t.emailLabel}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setApiEmailError(null);
          }}
          error={apiEmailError ?? (checked && !email.trim() ? t.errors.emailRequired : undefined)}
        />
        <TrapField ref={trapRef} id={`${id}-website`} label={t.trapLabel} />
        <div className="pt-2">
          <Button variant="primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t.busy : t.reset.requestSubmit}
          </Button>
        </div>
      </form>
    </AccountCard>
  );
};

/** The link's form: the new password, twice. */
const SetPasswordForm: React.FC<{ token: string; onRestart: () => void }> = ({ token, onRestart }) => {
  const t = useLocale().account;
  const id = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [checked, setChecked] = useState(false);
  const [apiPasswordError, setApiPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      // The reset ended every session, this browser's too.
      clearSession();
      setDone(true);
    },
    onError: (error) => {
      const apiError = toApiError(error);
      if (passwordFieldOfApiError(apiError.code)) {
        setApiPasswordError(apiError.message);
        passwordRef.current?.focus();
      } else {
        setFormError(apiError.message);
      }
    },
  });

  const passwordProblem = !password
    ? t.errors.passwordRequired
    : (() => {
        const problem = findPasswordProblem(password, '');
        return problem ? translateApiError(problem, { minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH }) : undefined;
      })();
  const confirmProblem = passwordConfirm !== password ? t.errors.passwordMismatch : undefined;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    setFormError(null);
    setApiPasswordError(null);
    if (passwordProblem) {
      passwordRef.current?.focus();
      return;
    }

    if (confirmProblem) {
      confirmRef.current?.focus();
      return;
    }

    mutation.mutate({ token, password });
  };

  if (done) {
    return (
      <AccountCard title={t.reset.setDoneTitle} focusTitle>
        <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.reset.setDone}</p>
        <p className="mb-0 mt-4 text-sm">
          <Link to="/login" className={linkClassName}>
            {t.reset.toLogin}
          </Link>
        </p>
      </AccountCard>
    );
  }

  return (
    <AccountCard title={t.reset.setTitle} intro={t.reset.setIntro}>
      <FormAlert message={formError} />
      {formError ? (
        <p className="-mt-2 mb-4 text-sm">
          <button type="button" className={linkClassName} onClick={onRestart}>
            {t.reset.requestAgain}
          </button>
        </p>
      ) : null}
      <form className="space-y-4" noValidate onSubmit={submit}>
        <AccountField
          ref={passwordRef}
          id={`${id}-password`}
          label={t.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setApiPasswordError(null);
          }}
          hint={formatMessage(t.passwordHint, { min: PASSWORD_MIN_LENGTH })}
          error={apiPasswordError ?? (checked ? passwordProblem : undefined)}
        />
        <AccountField
          ref={confirmRef}
          id={`${id}-passwordConfirm`}
          label={t.passwordConfirmLabel}
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          error={checked ? confirmProblem : undefined}
        />
        <div className="pt-2">
          <Button variant="primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t.busy : t.reset.setSubmit}
          </Button>
        </div>
      </form>
    </AccountCard>
  );
};

/**
 * `/reset-password` (U-05, #126): without a token, the request for a link; with `#token=…` (the
 * link of the reset email, kept out of server logs by the `#`), the new password. The token leaves
 * the address as soon as the page has read it.
 */
const ResetPasswordPage: React.FC = () => {
  // A client-only route: the address is there at the first render.
  const [token, setToken] = useState(() => tokenFromHash(window.location.hash));

  useEffect(() => {
    const dropHash = () => {
      if (window.location.hash) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
    };
    // A link opened in a tab already on this page changes only the hash: no new page load.
    const onHashChange = () => {
      const next = tokenFromHash(window.location.hash);
      dropHash();
      if (next) setToken(next);
    };
    dropHash();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return token ? <SetPasswordForm key={token} token={token} onRestart={() => setToken(null)} /> : <RequestForm />;
};

export default ResetPasswordPage;
