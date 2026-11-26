import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteUrlContext } from '../../app/siteUrl';
import { LocalizationProvider } from '../../localization/provider';
import type { ArticleTranslationDto } from '../../shared/types/ApiTypes';
import { ArticleMeta } from './ArticleMeta';

const head = (selector: string) => document.head.querySelector(selector);
const content = (selector: string) => head(selector)?.getAttribute('content');

const renderOnSite = (node: ReactNode, language: 'ru' | 'en' = 'ru') =>
  render(
    <SiteUrlContext.Provider value="https://mktba.ru">
      <LocalizationProvider language={language}>{node}</LocalizationProvider>
    </SiteUrlContext.Provider>,
  );

afterEach(cleanup);

describe('ArticleMeta', () => {
  it('given full metadata, when rendered, then hoists title, description, Open Graph, Twitter and canonical into head', () => {
    renderOnSite(
      <ArticleMeta
        meta={{ title: 'Намаз — порядок', description: 'Как совершать намаз', socialImageUrl: '/img/namaz.png', noIndex: false }}
        slug="namaz"
        publishedAt="2026-10-01T10:00:00Z"
        updatedAt="2026-11-02T12:00:00Z"
      />,
    );

    expect(head('title')?.textContent).toBe('Намаз — порядок — mktba');
    expect(content('meta[name="description"]')).toBe('Как совершать намаз');
    expect(content('meta[property="og:type"]')).toBe('article');
    expect(content('meta[property="og:title"]')).toBe('Намаз — порядок');
    expect(content('meta[property="og:description"]')).toBe('Как совершать намаз');
    expect(content('meta[property="og:site_name"]')).toBe('mktba');
    expect(content('meta[property="og:locale"]')).toBe('ru_RU');
    expect(content('meta[property="og:image"]')).toBe('https://mktba.ru/img/namaz.png');
    expect(content('meta[property="og:url"]')).toBe('https://mktba.ru/namaz');
    expect(content('meta[property="article:published_time"]')).toBe('2026-10-01T10:00:00Z');
    expect(content('meta[property="article:modified_time"]')).toBe('2026-11-02T12:00:00Z');
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(content('meta[name="twitter:title"]')).toBe('Намаз — порядок');
    expect(content('meta[name="twitter:image"]')).toBe('https://mktba.ru/img/namaz.png');
    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/namaz');
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it('given noindex, when rendered, then adds robots noindex', () => {
    renderOnSite(<ArticleMeta meta={{ title: 'Черновик', noIndex: true }} slug="draft" />);

    expect(content('meta[name="robots"]')).toBe('noindex');
  });

  it('given no description, image or dates, when rendered, then falls back to the site description and default image', () => {
    renderOnSite(<ArticleMeta meta={{ title: 'Пусто', description: null, socialImageUrl: null, noIndex: false }} slug="empty" />);

    expect(content('meta[name="description"]')).toBe('исламская wiki — мнения четырёх мазхабов в одном месте');
    expect(content('meta[property="og:image"]')).toBe('https://mktba.ru/og-default.png');
    expect(head('meta[property="article:published_time"]')).toBeNull();
  });

  it('given an absolute image URL, when rendered, then keeps it as is', () => {
    renderOnSite(<ArticleMeta meta={{ title: 'Картинка', socialImageUrl: 'https://cdn.example.com/a.png', noIndex: false }} slug="img" />);

    expect(content('meta[property="og:image"]')).toBe('https://cdn.example.com/a.png');
  });

  it('given a published English translation, when the Russian article is rendered, then hoists hreflang links to both and x-default', () => {
    renderOnSite(<ArticleMeta meta={{ title: 'Намаз', noIndex: false }} slug="namaz" locale="ru" translations={[translation()]} />);

    expect(hreflangLinks()).toEqual([
      ['ru', 'https://mktba.ru/namaz'],
      ['en', 'https://mktba.ru/en/prayer'],
      ['x-default', 'https://mktba.ru/namaz'],
    ]);
  });

  it('given the English version, when rendered under /en/, then it is indexed and lists the same links', () => {
    renderOnSite(
      <ArticleMeta meta={{ title: 'Prayer', noIndex: false }} slug="prayer" locale="en" translations={[translation({ locale: 'ru', slug: 'namaz' })]} />,
      'en',
    );

    expect(head('meta[name="robots"]')).toBeNull();
    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/en/prayer');
    expect(hreflangLinks()).toEqual([
      ['ru', 'https://mktba.ru/namaz'],
      ['en', 'https://mktba.ru/en/prayer'],
      ['x-default', 'https://mktba.ru/namaz'],
    ]);
  });

  it('given a noindex article with a translation, when rendered, then has no hreflang links', () => {
    renderOnSite(<ArticleMeta meta={{ title: 'Намаз', noIndex: true }} slug="namaz" locale="ru" translations={[translation()]} />);

    expect(hreflangLinks()).toEqual([]);
  });

  it('given a Russian original shown under /en/, when rendered, then its canonical is the original and it is noindex (I-08)', () => {
    renderOnSite(
      <ArticleMeta meta={{ title: 'Намаз', noIndex: false }} slug="namaz" locale="ru" translations={[]} shownOriginal />,
      'en',
    );

    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/namaz');
    expect(content('meta[property="og:url"]')).toBe('https://mktba.ru/namaz');
    expect(content('meta[name="robots"]')).toContain('noindex');
    expect(hreflangLinks()).toEqual([]);
  });
});

const hreflangLinks = () => [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')]
  .map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]);

const translation = (overrides: Partial<ArticleTranslationDto> = {}): ArticleTranslationDto => ({
  articleId: 2, locale: 'en', slug: 'prayer', title: 'Prayer', status: 'Published', noIndex: false, ...overrides,
});
