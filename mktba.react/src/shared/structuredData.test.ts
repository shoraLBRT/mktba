import { describe, expect, it } from 'vitest';
import {
  articleNode,
  breadcrumbListNode,
  organizationNode,
  serializeJsonLd,
  structuredDataGraph,
  webPageNode,
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
    expect(webSite.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://mktba.ru/search?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    });
  });

  it('given a full article, when building Article, then it has absolute URLs, dates and the organization as author and publisher', () => {
    const article = articleNode(site, {
      path: '/salat',
      headline: 'Салат',
      description: 'Молитва',
      image: '/img/salat.png',
      publishedAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-11-02T12:00:00Z',
    });

    expect(article).toEqual({
      '@id': 'https://mktba.ru/salat#article',
      '@type': 'Article',
      headline: 'Салат',
      description: 'Молитва',
      url: 'https://mktba.ru/salat',
      mainEntityOfPage: 'https://mktba.ru/salat',
      image: ['https://mktba.ru/img/salat.png'],
      inLanguage: 'ru',
      datePublished: '2026-10-01T10:00:00Z',
      dateModified: '2026-11-02T12:00:00Z',
      author: { '@id': 'https://mktba.ru/#organization' },
      publisher: { '@id': 'https://mktba.ru/#organization' },
      isPartOf: { '@id': 'https://mktba.ru/#website' },
    });
  });

  it('given authors with public pages, when building Article, then the author is their Person nodes and the publisher stays the organization', () => {
    const article = articleNode(site, {
      path: '/salat',
      headline: 'Салат',
      authors: [
        { name: 'Ахмад Иванов', path: '/authors/ahmad-ivanov' },
        { name: 'Умар Петров', path: '/authors/umar-petrov' },
      ],
    });

    expect(article.author).toEqual([
      { '@id': 'https://mktba.ru/authors/ahmad-ivanov#person' },
      { '@id': 'https://mktba.ru/authors/umar-petrov#person' },
    ]);
    expect(article.publisher).toEqual({ '@id': 'https://mktba.ru/#organization' });
  });

  it('given an empty author list, when building Article, then the author is the organization', () => {
    const article = articleNode(site, { path: '/salat', headline: 'Салат', authors: [] });

    expect(article.author).toEqual({ '@id': 'https://mktba.ru/#organization' });
  });

  it('given an article without description, image or dates, when building Article, then those fields are left out and the default image is used', () => {
    const article = articleNode(site, { path: '/a', headline: 'A', description: null, image: null });

    expect(article.image).toEqual(['https://mktba.ru/og-default.png']);
    expect(article).not.toHaveProperty('description');
    expect(article).not.toHaveProperty('datePublished');
    expect(article).not.toHaveProperty('dateModified');
  });

  it('given reviewers, when building WebPage, then it names them in reviewedBy with the latest date and the Article as its main entity (V-08, #124)', () => {
    const page = webPageNode(site, {
      path: '/salat',
      headline: 'Намаз',
      reviewers: [
        { name: 'Абдулла', path: '/authors/abdulla', reviewedAt: '2026-11-20T10:00:00Z' },
        { name: 'Юсуф', path: null, reviewedAt: '2026-11-26T10:00:00Z' },
      ],
    });

    expect(page).toEqual({
      '@id': 'https://mktba.ru/salat#webpage',
      '@type': 'WebPage',
      name: 'Намаз',
      url: 'https://mktba.ru/salat',
      inLanguage: 'ru',
      isPartOf: { '@id': 'https://mktba.ru/#website' },
      mainEntity: { '@id': 'https://mktba.ru/salat#article' },
      reviewedBy: [{ '@id': 'https://mktba.ru/authors/abdulla#person' }, { '@type': 'Person', name: 'Юсуф' }],
      lastReviewed: '2026-11-26T10:00:00Z',
    });
    expect(webPageNode(site, { path: '/salat', headline: 'Намаз', reviewers: [] })).toBeNull();
    expect(webPageNode(site, { path: '/salat', headline: 'Намаз' })).toBeNull();
  });

  it('given a trail, when building BreadcrumbList, then positions start at 1 and items are absolute', () => {
    const list = breadcrumbListNode('https://mktba.ru', '/salat', [
      { name: 'Ибадат', path: '/ibadat' },
      { name: 'Салат', path: '/salat' },
    ]);

    expect(list?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Ибадат', item: 'https://mktba.ru/ibadat' },
      { '@type': 'ListItem', position: 2, name: 'Салат', item: 'https://mktba.ru/salat' },
    ]);
  });

  it('given an empty trail, when building BreadcrumbList, then there is none and the graph leaves it out', () => {
    const list = breadcrumbListNode('https://mktba.ru', '/a', []);

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
