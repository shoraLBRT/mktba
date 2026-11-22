import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

  it('given a link to an article of the site, when rendered, then it stays in the tab with its address', () => {
    const { container } = render(
      <MemoryRouter>
        <MarkdownContent content={'[намаз](/namaz#p-3) [чужой](//example.com/x)'} />
      </MemoryRouter>,
    );
    const [internal, protocolRelative] = container.querySelectorAll('a');

    expect(internal.getAttribute('href')).toBe('/namaz#p-3');
    expect(internal.hasAttribute('target')).toBe(false);
    expect(protocolRelative.getAttribute('target')).toBe('_blank');
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

  it('given heading anchors, when rendered, then each heading gets its id and a link to itself', () => {
    const { container } = render(
      <MarkdownContent
        content={'## Условия\n\nТекст\n\n### Ният'}
        headingAnchors={[
          { id: 'usloviya', text: 'Условия', linkLabel: 'Ссылка на раздел «Условия»' },
          { id: 'niyat', text: 'Ният', linkLabel: 'Ссылка на раздел «Ният»' },
        ]}
      />,
    );

    const headings = [...container.querySelectorAll('h2, h3')];
    expect(headings.map((heading) => heading.id)).toEqual(['usloviya', 'niyat']);
    expect(headings.map((heading) => heading.getAttribute('aria-label'))).toEqual(['Условия', 'Ният']);
    const links = [...container.querySelectorAll('a.heading-anchor')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#usloviya', '#niyat']);
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Ссылка на раздел «Условия»',
      'Ссылка на раздел «Ният»',
    ]);
    expect(links.every((link) => link.getAttribute('target') === null)).toBe(true);
  });

  it('given no heading anchors, when rendered, then headings carry neither an id nor a link', () => {
    const { container } = render(<MarkdownContent content={'## Условия'} />);

    expect(container.querySelector('h2')?.id).toBe('');
    expect(container.querySelector('a')).toBeNull();
  });

  it('given fewer anchors than headings, when rendered, then the extra heading stays plain', () => {
    const { container } = render(
      <MarkdownContent
        content={'## One\n\n## Two'}
        headingAnchors={[{ id: 'one', text: 'One', linkLabel: 'Link to One' }]}
      />,
    );

    expect([...container.querySelectorAll('h2')].map((heading) => heading.id)).toEqual(['one', '']);
    expect(container.querySelectorAll('a.heading-anchor')).toHaveLength(1);
  });

  it('renders nothing for empty content', () => {
    const { container } = render(<MarkdownContent content="" />);

    expect(container.textContent).toBe('');
  });
});

describe('MarkdownContent: Arabic (R-15)', () => {
  it('given an Arabic phrase inside a Russian sentence, when rendered, then the phrase is an isolated Arabic span', () => {
    const { container } = render(<MarkdownContent content={'Он сказал: «السلام عليكم», и ушёл.'} />);
    const paragraph = container.querySelector('p');
    const span = paragraph?.querySelector('span.arabic');

    expect(paragraph?.hasAttribute('dir')).toBe(false);
    expect(span?.textContent).toBe('السلام عليكم');
    expect(span?.getAttribute('lang')).toBe('ar');
    expect(span?.getAttribute('dir')).toBe('rtl');
    expect(paragraph?.textContent).toBe('Он сказал: «السلام عليكم», и ушёл.');
  });

  it('given a paragraph of Arabic only in a quote, when rendered, then the paragraph itself is right-to-left and the translation is not', () => {
    const { container } = render(
      <MarkdownContent content={'> بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n>\n> Во имя Аллаха, Милостивого, Милосердного.'} />,
    );
    const [ayah, translation] = container.querySelectorAll('blockquote p');

    expect(ayah.className).toBe('arabic-block');
    expect(ayah.getAttribute('lang')).toBe('ar');
    expect(ayah.getAttribute('dir')).toBe('rtl');
    expect(ayah.querySelector('span')).toBeNull();
    expect(translation.hasAttribute('dir')).toBe(false);
  });

  it('given Arabic in bold and in code, when rendered, then the bold run is marked and the code is left as written', () => {
    const { container } = render(<MarkdownContent content={'Слово **صلاة** и код `صلاة`.'} />);

    expect(container.querySelector('strong span.arabic')?.textContent).toBe('صلاة');
    expect(container.querySelector('code')?.querySelector('span')).toBeNull();
  });
});
