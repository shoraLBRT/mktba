import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteUrlContext } from '../app/siteUrl';
import { LocalizationProvider } from '../localization/provider';
import { ArticleStructuredData, SiteStructuredData } from './StructuredData';

const renderOnSite = (node: ReactNode) =>
  render(
    <SiteUrlContext.Provider value="https://mktba.ru">
      <LocalizationProvider>{node}</LocalizationProvider>
    </SiteUrlContext.Provider>,
  );

type Graph = { '@context': string; '@graph': Array<Record<string, unknown>> };

const renderedGraph = (container: HTMLElement): Graph => {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  expect(scripts).toHaveLength(1);
  return JSON.parse(scripts[0].textContent ?? '') as Graph;
};

afterEach(cleanup);

describe('StructuredData', () => {
  it('given the home page, when rendered, then one JSON-LD script carries the Organization and the WebSite', () => {
    const { container } = renderOnSite(<SiteStructuredData />);

    const graph = renderedGraph(container);
    expect(graph['@context']).toBe('https://schema.org');
    expect(graph['@graph'].map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
    expect(graph['@graph'][0]).toMatchObject({ name: 'mktba', url: 'https://mktba.ru/' });
  });

  it('given an article with a trail, when rendered, then the graph has Article and BreadcrumbList', () => {
    const { container } = renderOnSite(
      <ArticleStructuredData
        article={{ path: '/article/salat', headline: 'Салат', publishedAt: '2026-10-01T10:00:00Z' }}
        breadcrumbs={[{ name: 'Салат', path: '/article/salat' }]}
      />,
    );

    const nodes = renderedGraph(container)['@graph'];
    expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList']);
    expect(nodes[2]).toMatchObject({ headline: 'Салат', datePublished: '2026-10-01T10:00:00Z' });
  });

  it('given an article by an author with a page, when rendered, then the graph ends with the Person the Article names', () => {
    const { container } = renderOnSite(
      <ArticleStructuredData
        article={{ path: '/article/salat', headline: 'Салат', authors: [{ name: 'Ахмад Иванов', path: '/authors/ahmad-ivanov' }] }}
        breadcrumbs={[{ name: 'Салат', path: '/article/salat' }]}
      />,
    );

    const nodes = renderedGraph(container)['@graph'];
    expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'Article', 'BreadcrumbList', 'Person']);
    expect(nodes[4]).toEqual({
      '@id': 'https://mktba.ru/authors/ahmad-ivanov#person',
      '@type': 'Person',
      name: 'Ахмад Иванов',
      url: 'https://mktba.ru/authors/ahmad-ivanov',
    });
    expect(nodes[2]).toMatchObject({ author: [{ '@id': nodes[4]['@id'] }] });
  });

  it('given a headline with a closing script tag, when rendered, then the script is not broken and the headline survives', () => {
    const headline = '</script><img src=x onerror=alert(1)>';
    const { container } = renderOnSite(
      <ArticleStructuredData article={{ path: '/article/x', headline }} breadcrumbs={[]} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('</script><img');
    expect(renderedGraph(container)['@graph'][2]).toMatchObject({ headline });
  });
});
