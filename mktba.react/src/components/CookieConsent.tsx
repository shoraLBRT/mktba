import { useState } from 'react';
import { getConsent, initMetrika, setConsent } from '../analytics/metrika';
import { startWebVitals } from '../analytics/events';
import { useLocale } from '../localization/hooks';
import { useHydrated } from '../shared/useHydrated';

/** Asks for analytics consent once; shown only in the browser, after hydration, since the answer is in `localStorage`. */
export const CookieConsent = () => {
  const locale = useLocale();
  const t = locale.cookieConsent;
  const hydrated = useHydrated();
  const [answered, setAnswered] = useState(false);

  if (!hydrated || answered || getConsent() !== null) return null;

  const handleAccept = () => {
    setConsent(true);
    initMetrika();
    startWebVitals();
    setAnswered(true);
  };

  const handleDecline = () => {
    setConsent(false);
    setAnswered(true);
  };

  return (
    <div className="fixed bottom-5 inset-s-5 z-50 max-w-[320px] rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 shadow-lg">
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
