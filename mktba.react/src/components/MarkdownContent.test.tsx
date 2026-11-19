import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MarkdownContent from './MarkdownContent';

afterEach(cleanup);

describe('MarkdownContent', () => {
  it('renders GitHub Flavored Markdown tables, strikethrough and autolinks', () => {
    const { container } = render(
      <MarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |\n\n~~old~~ https://mktba.ru'} />,
    );

    expect(container.querySelectorAll('table td')).toHaveLength(2);
    expect(container.querySelector('del')?.textContent).toBe('old');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://mktba.ru');
  });

  it('opens external links in a new tab and keeps anchor links in place', () => {
    const { container } = render(<MarkdownContent content={'[out](https://example.com) [in](#part)'} />);
    const [external, anchor] = container.querySelectorAll('a');

    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    expect(anchor.hasAttribute('target')).toBe(false);
  });

  it('loads images lazily so they do not compete with the text above them', () => {
    const { container } = render(<MarkdownContent content={'![map](/map.png)'} />);
    const image = container.querySelector('img');

    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('alt')).toBe('map');
  });

  it('starts headings below the page h1 so the article keeps a single h1', () => {
    const { container } = render(<MarkdownContent content={'# Part\n\n## Detail\n\n# Next'} />);
    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => heading.tagName);

    expect(levels).toEqual(['H2', 'H3', 'H2']);
  });

  it('lifts content that starts at a deep level and closes skipped levels', () => {
    const { container } = render(<MarkdownContent content={'### Part\n\n###### Deep\n\n#### Child'} />);
    const levels = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => heading.tagName);

    expect(levels).toEqual(['H2', 'H3', 'H3']);
  });

  it('keeps an empty alt only when the markdown image has no description', () => {
    const { container } = render(<MarkdownContent content={'![](/divider.png)'} />);

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('renders nothing for empty content', () => {
    const { container } = render(<MarkdownContent content="" />);

    expect(container.textContent).toBe('');
  });
});
