import { useState } from 'react';
import { getConsent, initMetrika, setConsent } from '../analytics/metrika';
import { useLocale } from '../localization/hooks';

export const CookieConsent = () => {
  const locale = useLocale();
  const t = locale.cookieConsent;
  const [visible, setVisible] = useState(() => getConsent() === null);

  if (!visible) return null;

  const handleAccept = () => {
    setConsent(true);
    initMetrika();
    setVisible(false);
  };

  const handleDecline = () => {
    setConsent(false);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-5 left-5 z-50 max-w-[320px] rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 shadow-lg">
      <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">{t.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleAccept}
          className="flex-1 rounded-xl bg-[var(--color-brand-forest)] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-forest-strong)]"
        >
          {t.accept}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          className="flex-1 rounded-xl border border-[var(--color-border-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)]"
        >
          {t.decline}
        </button>
      </div>
    </div>
  );
};
