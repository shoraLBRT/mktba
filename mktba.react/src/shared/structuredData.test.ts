import { describe, expect, it } from 'vitest';
import {
  articleNode,
  breadcrumbListNode,
  organizationNode,
  serializeJsonLd,
  structuredDataGraph,
  webSiteNode,
} from './structuredData';

const site = { siteUrl: 'https://mktba.ru', name: 'mktba', description: 'исламская wiki' };

describe('structured data builders', () => {
  it('given the site facts, when building Organization and WebSite, then they link by @id and carry no search action', () => {
    const organization = organizationNode(site);
    const webSite = webSiteNode(site);

    expect(organization).toEqual({
      '@id': 'https://mktba.ru/#organization',
      '@type': 'Organization',
      name: 'mktba',
      url: 'https://mktba.ru/',
      logo: { '@type': 'ImageObject', url: 'https://mktba.ru/icon-512.png' },
    });
    expect(webSite).toMatchObject({
      '@id': 'https://mktba.ru/#website',
      '@type': 'WebSite',
      url: 'https://mktba.ru/',
      inLanguage: 'ru',
      publisher: { '@id': organization['@id'] },
    });
    expect(webSite).not.toHaveProperty('potentialAction');
  });

  it('given a full article, when building Article, then it has absolute URLs, dates and the organization as author and publisher', () => {
    const article = articleNode(site, {
      path: '/article/salat',
      headline: 'Салат',
      description: 'Молитва',
      image: '/img/salat.png',
      publishedAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-11-02T12:00:00Z',
    });

    expect(article).toEqual({
      '@id': 'https://mktba.ru/article/salat#article',
      '@type': 'Article',
      headline: 'Салат',
      description: 'Молитва',
      url: 'https://mktba.ru/article/salat',
      mainEntityOfPage: 'https://mktba.ru/article/salat',
      image: ['https://mktba.ru/img/salat.png'],
      inLanguage: 'ru',
      datePublished: '2026-10-01T10:00:00Z',
      dateModified: '2026-11-02T12:00:00Z',
      author: { '@id': 'https://mktba.ru/#organization' },
      publisher: { '@id': 'https://mktba.ru/#organization' },
      isPartOf: { '@id': 'https://mktba.ru/#website' },
    });
  });

  it('given an article without description, image or dates, when building Article, then those fields are left out and the default image is used', () => {
    const article = articleNode(site, { path: '/article/a', headline: 'A', description: null, image: null });

    expect(article.image).toEqual(['https://mktba.ru/og-default.png']);
    expect(article).not.toHaveProperty('description');
    expect(article).not.toHaveProperty('datePublished');
    expect(article).not.toHaveProperty('dateModified');
  });

  it('given a trail, when building BreadcrumbList, then positions start at 1 and items are absolute', () => {
    const list = breadcrumbListNode('https://mktba.ru', '/article/salat', [
      { name: 'Ибадат', path: '/article/ibadat' },
      { name: 'Салат', path: '/article/salat' },
    ]);

    expect(list?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Ибадат', item: 'https://mktba.ru/article/ibadat' },
      { '@type': 'ListItem', position: 2, name: 'Салат', item: 'https://mktba.ru/article/salat' },
    ]);
  });

  it('given an empty trail, when building BreadcrumbList, then there is none and the graph leaves it out', () => {
    const list = breadcrumbListNode('https://mktba.ru', '/article/a', []);

    expect(list).toBeNull();
    expect(structuredDataGraph([organizationNode(site), list])['@graph']).toHaveLength(1);
  });
});

describe('serializeJsonLd', () => {
  it('given a title that closes the script, when serialized, then no "<" or ">" is left and the JSON round-trips', () => {
    const value = { headline: '</script><script>alert(1)</script> & <!--' };

    const json = serializeJsonLd(value);

    expect(json).not.toMatch(/[<>&]/);
    expect(json).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(json)).toEqual(value);
  });

  it('given line and paragraph separators, when serialized, then they are escaped and the JSON round-trips', () => {
    const value = { name: 'a\u2028b\u2029c' };

    const json = serializeJsonLd(value);

    expect(json).toBe('{"name":"a\\u2028b\\u2029c"}');
    expect(JSON.parse(json)).toEqual(value);
  });
});
