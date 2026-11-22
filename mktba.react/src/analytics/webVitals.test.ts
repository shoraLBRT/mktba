import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebVitalReporter, observeWebVitals } from './webVitals';

const { onLCP, onINP, onCLS } = vi.hoisted(() => ({ onLCP: vi.fn(), onINP: vi.fn(), onCLS: vi.fn() }));
vi.mock('web-vitals', () => ({ onLCP, onINP, onCLS }));

const track = vi.fn();
const flush = vi.fn();

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

beforeEach(() => {
  track.mockClear();
  flush.mockClear();
  setVisibility('visible');
});

describe('web vitals', () => {
  it('given the three metrics, when reported, then each is tracked as its own event with a rounded value', () => {
    const report = createWebVitalReporter(track, flush);

    report({ name: 'LCP', value: 1834.56 });
    report({ name: 'INP', value: 120.4 });
    report({ name: 'CLS', value: 0.123456 });
    report({ name: 'TTFB', value: 80 });

    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { type: 'WebVitalLcp', value: 1835 },
      { type: 'WebVitalInp', value: 120 },
      { type: 'WebVitalCls', value: 0.123 },
    ]);
    expect(flush).not.toHaveBeenCalled();
  });

  it('given the page is hidden, when a metric is reported, then it is sent at once', () => {
    setVisibility('hidden');

    createWebVitalReporter(track, flush)({ name: 'CLS', value: 0.02 });

    expect(track).toHaveBeenCalledWith({ type: 'WebVitalCls', value: 0.02 });
    expect(flush).toHaveBeenCalledOnce();
  });

  it('when observed, then listens to LCP, INP and CLS', () => {
    observeWebVitals(track, flush);

    expect(onLCP).toHaveBeenCalledOnce();
    expect(onINP).toHaveBeenCalledOnce();
    expect(onCLS).toHaveBeenCalledOnce();
  });
});
