declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...args: unknown[]) => void;
  }
}

const COUNTER_ID = Number(import.meta.env.VITE_METRIKA_ID ?? 0);
const CONSENT_KEY = 'mktba.consent';

export const getConsent = (): boolean | null => {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return null;
};

export const setConsent = (value: boolean): void => {
  localStorage.setItem(CONSENT_KEY, String(value));
};

type YmFn = (counterId: number, action: string, ...args: unknown[]) => void;

export const initMetrika = (): void => {
  if (!COUNTER_ID || getConsent() !== true || window.ym) return;

  const stub: YmFn & { a?: unknown[]; l?: number } = function (...args: unknown[]) {
    (stub.a ??= []).push(args);
  } as YmFn & { a?: unknown[]; l?: number };
  stub.l = Date.now();
  window.ym = stub;

  const script = document.createElement('script');
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  script.async = true;
  document.head.appendChild(script);

  window.ym(COUNTER_ID, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
};

export const trackGoal = (goal: string, params?: Record<string, unknown>): void => {
  if (!COUNTER_ID || getConsent() !== true || !window.ym) return;
  window.ym(COUNTER_ID, 'reachGoal', goal, params);
};
