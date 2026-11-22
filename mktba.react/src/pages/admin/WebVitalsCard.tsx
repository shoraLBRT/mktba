import React from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { SiteAnalyticsDto } from '../../shared/types/ApiTypes';
import { Card } from '../../shared/ui/Card';

type WebVital = SiteAnalyticsDto['webVitals'][number];

/** Google's thresholds, as the server's `WebVitals`: at most `good` is good, above `poor` is poor. */
const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  WebVitalLcp: { good: 2500, poor: 4000 },
  WebVitalInp: { good: 200, poor: 500 },
  WebVitalCls: { good: 0.1, poor: 0.25 },
};

const RATING_CLASSES = {
  good: 'text-[var(--color-brand-forest)]',
  needsImprovement: 'text-amber-700',
  poor: 'text-red-700',
} as const;

const rateWebVital = (metric: string, value: number): keyof typeof RATING_CLASSES => {
  const limits = THRESHOLDS[metric];
  if (!limits || value <= limits.good) return 'good';
  return value <= limits.poor ? 'needsImprovement' : 'poor';
};

const percent = (part: number, total: number) => `${Math.round((part / total) * 100)}%`;

/**
 * LCP, INP and CLS of real page loads over the dashboard's period (N-11, #153): the p75 with its
 * rating and the share of page loads in each rating, from `SiteAnalyticsDto.webVitals`.
 */
export const WebVitalsCard: React.FC<{ webVitals: WebVital[] }> = ({ webVitals }) => {
  const t = useLocale().siteAnalytics;
  const names: Record<string, string> = { WebVitalLcp: t.webVitalsLcp, WebVitalInp: t.webVitalsInp, WebVitalCls: t.webVitalsCls };
  const ratingNames = { good: t.webVitalsGood, needsImprovement: t.webVitalsNeedsImprovement, poor: t.webVitalsPoor };

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[var(--color-ink-strong)]">{t.webVitalsTitle}</h3>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.webVitalsDescription}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm" data-testid="site-analytics-web-vitals">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-widest text-[var(--color-ink-subtle)]">
              <th scope="col" className="pb-2 font-semibold">{t.webVitalsMetricColumn}</th>
              <th scope="col" className="pb-2 text-right font-semibold">{t.webVitalsP75Column}</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">{t.webVitalsRatingColumn}</th>
              <th scope="col" className="pb-2 pl-3 text-right font-semibold">{t.webVitalsSamplesColumn}</th>
            </tr>
          </thead>
          <tbody>
            {webVitals.map((vital) => {
              const rating = vital.p75 == null ? null : rateWebVital(vital.metric, vital.p75);
              const p75 =
                vital.p75 == null
                  ? t.webVitalsNoSamples
                  : vital.metric === 'WebVitalCls'
                    ? vital.p75.toFixed(2)
                    : formatMessage(t.webVitalsMs, { value: Math.round(vital.p75) });
              return (
                <tr key={vital.metric} className="border-t border-[var(--color-border-soft)]" data-testid={`web-vital-${vital.metric}`}>
                  <td className="py-2 pr-3">{names[vital.metric] ?? vital.metric}</td>
                  <td className="py-2 text-right tabular-nums">
                    {rating ? (
                      <span className={RATING_CLASSES[rating]} title={ratingNames[rating]}>
                        {p75}
                        <span className="sr-only"> ({ratingNames[rating]})</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-ink-muted)]">{p75}</span>
                    )}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {vital.samples === 0
                      ? '—'
                      : [vital.good, vital.needsImprovement, vital.poor].map((n) => percent(n, vital.samples)).join(' · ')}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">{vital.samples}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
