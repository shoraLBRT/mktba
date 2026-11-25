import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteUrlContext } from '../app/siteUrl';
import { LocalizationProvider } from '../localization/provider';
import { NotFoundMeta, PageMeta } from './PageMeta';

const head = (selector: string) => document.head.querySelector(selector);
const content = (selector: string) => head(selector)?.getAttribute('content');

const onSite = (node: ReactNode) => (
  <SiteUrlContext.Provider value="https://mktba.ru">
    <LocalizationProvider>{node}</LocalizationProvider>
  </SiteUrlContext.Provider>
);

afterEach(cleanup);

describe('PageMeta', () => {
  it('given English, when an article is rendered, then it is indexed with its hreflang; a list page is not and has none (O-08, #104)', () => {
    const alternates = [{ hreflang: 'ru', href: 'https://mktba.ru/namaz' }, { hreflang: 'en', href: 'https://mktba.ru/en/prayer' }];
    const english = (node: ReactNode) => (
      <SiteUrlContext.Provider value="https://mktba.ru">
        <LocalizationProvider language="en">{node}</LocalizationProvider>
      </SiteUrlContext.Provider>
    );

    const { unmount } = render(english(<PageMeta path="/prayer" type="article" alternates={alternates} />));
    expect(head('meta[name="robots"]')).toBeNull();
    expect(document.head.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(2);
    unmount();

    render(english(<PageMeta path="/" alternates={alternates} />));
    expect(content('meta[name="robots"]')).toBe('noindex');
    expect(document.head.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(0);
  });

  it('given no props but a path, when rendered for the home page, then uses the site title, description and default image', () => {
    render(onSite(<PageMeta path="/" />));

    expect(head('title')?.textContent).toBe('mktba — исламская wiki');
    expect(content('meta[name="description"]')).toBe('исламская wiki — мнения четырёх мазхабов в одном месте');
    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/');
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[property="og:image"]')).toBe('https://mktba.ru/og-default.png');
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it('given noindex and nofollow without a path, when rendered, then forbids indexing and leaves canonical and og:url out', () => {
    render(onSite(<PageMeta noIndex noFollow />));

    expect(content('meta[name="robots"]')).toBe('noindex, nofollow');
    expect(head('link[rel="canonical"]')).toBeNull();
    expect(head('meta[property="og:url"]')).toBeNull();
  });

  it('given no image and no description, when rendered, then uses the small Twitter card and no description tags', () => {
    render(onSite(<PageMeta title="Служебная" image={null} description={null} />));

    expect(content('meta[name="twitter:card"]')).toBe('summary');
    expect(head('meta[property="og:image"]')).toBeNull();
    expect(head('meta[name="description"]')).toBeNull();
    expect(head('meta[name="twitter:description"]')).toBeNull();
  });

  it('given one page replaced by another, when re-rendered, then head holds one set of tags', () => {
    const view = render(onSite(<PageMeta title="Первая" path="/a" />));
    view.rerender(onSite(<NotFoundMeta />));

    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(head('title')?.textContent).toBe('Страница не найдена — mktba');
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(head('link[rel="canonical"]')).toBeNull();
    expect(content('meta[name="robots"]')).toBe('noindex');
  });
});
