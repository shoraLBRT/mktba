import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from '../../auth/useCurrentUser';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { resendConfirmation } from '../../services/authService';
import { toApiError } from '../../shared/api-client/apiError';
import { Button } from '../../shared/ui/Button';

/**
 * U-05 (#126): while the signed-in user's address is not confirmed, says so and sends the
 * confirmation email again on request. Nothing once it is confirmed (every invited user is).
 */
export const EmailConfirmationNotice: React.FC = () => {
  const t = useLocale().account.notice;
  const { user } = useCurrentUser();
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const resend = useMutation({
    mutationFn: resendConfirmation,
    onSuccess: () => setMessage({ text: t.resent, failed: false }),
    onError: (error) => setMessage({ text: toApiError(error).message, failed: true }),
  });

  if (!user || user.emailConfirmed) {
    return null;
  }

  return (
    <div data-testid="email-confirmation-notice" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="m-0">{formatMessage(t.unconfirmed, { email: user.email })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => resend.mutate()} disabled={resend.isPending}>
          {t.resend}
        </Button>
        {message ? (
          <span role={message.failed ? 'alert' : 'status'} className={message.failed ? 'text-red-700' : undefined}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
};
