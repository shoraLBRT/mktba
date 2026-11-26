import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { confirmEmail } from '../../services/authService';
import { useSession } from '../../services/session';
import { toApiError } from '../../shared/api-client/apiError';
import { AccountCard } from './AccountForm';
import { linkClassName, tokenFromHash } from './account';

type State = { kind: 'pending' } | { kind: 'done' } | { kind: 'failed'; message: string };

/**
 * `/confirm-email#token=…` (U-05, #126): the link of the confirmation email. The token is after
 * `#`, so it never reaches a server log; the page posts it once and removes it from the address.
 */
const ConfirmEmailPage: React.FC = () => {
  const t = useLocale().account;
  const signedIn = useSession().accessToken !== null;
  const queryClient = useQueryClient();
  // Read before the effect removes it; the page renders only in the browser (a client-only route).
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'pending' } : { kind: 'failed', message: t.confirm.missingToken });
  const started = useRef(false);

  useEffect(() => {
    // Once per opened link, also when React runs the effect twice (StrictMode): the token is single-use.
    if (started.current) return;
    started.current = true;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!token) return;

    confirmEmail(token)
      .then(() => {
        setState({ kind: 'done' });
        void queryClient.invalidateQueries({ queryKey: [APP_CONSTANTS.QUERY_KEYS.CURRENT_USER] });
      })
      .catch((error: unknown) => setState({ kind: 'failed', message: toApiError(error).message }));
  }, [token, queryClient]);

  if (state.kind === 'pending') {
    return (
      <AccountCard title={t.confirm.title}>
        <p role="status" className="m-0 text-sm text-[var(--color-ink-muted)]">
          {t.confirm.pending}
        </p>
      </AccountCard>
    );
  }

  if (state.kind === 'done') {
    return (
      <AccountCard title={t.confirm.doneTitle} focusTitle>
        <p className="m-0 text-sm text-[var(--color-ink-muted)]">{t.confirm.done}</p>
        <p className="mb-0 mt-4 text-sm">
          <Link to={signedIn ? '/admin/profile' : '/login'} className={linkClassName}>
            {signedIn ? t.confirm.toProfile : t.confirm.toLogin}
          </Link>
        </p>
      </AccountCard>
    );
  }

  return (
    <AccountCard title={t.confirm.failedTitle} focusTitle>
      <p role="alert" className="m-0 text-sm text-red-700">
        {state.message}
      </p>
      <p className="mb-0 mt-4 text-sm text-[var(--color-ink-muted)]">{t.confirm.resendHint}</p>
      <p className="mb-0 mt-4 text-sm">
        <Link to={signedIn ? '/admin/profile' : '/login'} className={linkClassName}>
          {signedIn ? t.confirm.toProfile : t.confirm.toLogin}
        </Link>
      </p>
    </AccountCard>
  );
};

export default ConfirmEmailPage;
