import { afterEach, describe, expect, it, vi } from 'vitest';

/** The module reads the counter id once, at import: each case imports it afresh. */
const loadMetrika = async (counterId: string | undefined) => {
  vi.resetModules();
  if (counterId !== undefined) vi.stubEnv('VITE_METRIKA_ID', counterId);
  return import('./metrika');
};

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.ym;
  localStorage.clear();
});

describe('Metrika calls', () => {
  it('given a counter, consent and a started counter, when a goal and a page view are sent, then both reach ym', async () => {
    const metrika = await loadMetrika('123');
    metrika.setConsent(true);
    const ym = vi.fn();
    window.ym = ym;

    metrika.trackGoal(metrika.METRIKA_GOALS.search);
    metrika.trackPageView('https://mktba.ru/zakyat', 'https://mktba.ru/', 'Закят — mktba');

    expect(ym.mock.calls).toEqual([
      [123, 'reachGoal', 'search', undefined],
      [123, 'hit', 'https://mktba.ru/zakyat', { referer: 'https://mktba.ru/', title: 'Закят — mktba' }],
    ]);
  });

  it('given a declined consent, when a goal and a page view are sent, then ym is not called', async () => {
    const metrika = await loadMetrika('123');
    metrika.setConsent(false);
    const ym = vi.fn();
    window.ym = ym;

    metrika.trackGoal(metrika.METRIKA_GOALS.tocClick, { depth: 2 });
    metrika.trackPageView('https://mktba.ru/a', 'https://mktba.ru/', 'A');

    expect(ym).not.toHaveBeenCalled();
  });

  it('given no counter id, when Metrika is started and used, then nothing is loaded or sent', async () => {
    const metrika = await loadMetrika('');
    metrika.setConsent(true);

    metrika.initMetrika();
    metrika.trackGoal(metrika.METRIKA_GOALS.articleReadEnd, { articleId: 1 });

    expect(window.ym).toBeUndefined();
    expect(document.querySelector('script[src*="mc.yandex.ru"]')).toBeNull();
  });
});
