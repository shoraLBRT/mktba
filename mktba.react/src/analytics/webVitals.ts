import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';
import type { AnalyticsEventInput } from './events';

/**
 * Web Vitals of real page loads (N-11, #153): LCP, INP and CLS, measured by `web-vitals` and sent
 * as own analytics events (`WebVitalLcp` / `WebVitalInp` / `WebVitalCls`, `value`) through the
 * `trackEvent` it is handed, with its consent and queue. Loaded lazily by `startWebVitals`
 * (`events.ts`), never in the first-load chunk. INP and CLS are final only when the page is hidden,
 * after the queue's own flush may have run, so a value reported then is sent at once.
 */
const EVENT_TYPES = { LCP: 'WebVitalLcp', INP: 'WebVitalInp', CLS: 'WebVitalCls' } as const;

type Track = (event: AnalyticsEventInput) => void;

export const createWebVitalReporter =
  (track: Track, flush: () => void) =>
  (metric: Pick<Metric, 'name' | 'value'>): void => {
    const type = EVENT_TYPES[metric.name as keyof typeof EVENT_TYPES];
    if (!type) return;

    const value = metric.name === 'CLS' ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value);
    track({ type, value });
    if (document.visibilityState === 'hidden') flush();
  };

export const observeWebVitals = (track: Track, flush: () => void): void => {
  const report = createWebVitalReporter(track, flush);
  onLCP(report);
  onINP(report);
  onCLS(report);
};
