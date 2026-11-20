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

/** The goal ids sent to Metrika (N-01, #51). Goals are set up in the counter by these ids: never rename one. */
export const METRIKA_GOALS = {
  articleView: 'article_view',
  articleTime5min: 'article_time_5min',
  articleReadEnd: 'article_read_end',
  opinionSwitch: 'opinion_switch',
  mazhabChange: 'mazhab_change',
  search: 'search',
  tocClick: 'toc_click',
} as const;

export type MetrikaGoal = (typeof METRIKA_GOALS)[keyof typeof METRIKA_GOALS];

/** No counter id, no consent or no `init` yet → every call below does nothing (tests, e2e, declined visitors). */
const counter = (): YmFn | null => (COUNTER_ID && getConsent() === true && window.ym ? window.ym : null);

export const trackGoal = (goal: MetrikaGoal, params?: Record<string, unknown>): void => {
  counter()?.(COUNTER_ID, 'reachGoal', goal, params);
};

/**
 * A page view after a client-side navigation. The page a visit starts on is counted by `init`
 * itself, so only later locations come here (`usePageViewTracking`).
 */
export const trackPageView = (url: string, referer: string, title: string): void => {
  counter()?.(COUNTER_ID, 'hit', url, { referer, title });
};
