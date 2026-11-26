import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentMarkdown } from './CommentMarkdown';

afterEach(cleanup);

const renderBody = (body: string) => render(<CommentMarkdown body={body} />).container;

describe('CommentMarkdown', () => {
  it('renders the minimum: bold, italic, code, a quote and a link that search engines do not follow', () => {
    const container = renderBody('**жирный** *курсив* `код`\n\n> цитата\n\n[ссылка](https://example.com/a)');

    expect(container.querySelector('strong')?.textContent).toBe('жирный');
    expect(container.querySelector('em')?.textContent).toBe('курсив');
    expect(container.querySelector('code')?.textContent).toBe('код');
    expect(container.querySelector('blockquote')?.textContent?.trim()).toBe('цитата');
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://example.com/a');
    expect(link.getAttribute('rel')).toBe('nofollow ugc noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('never renders raw HTML: no script, image, iframe, event handler or style reaches the page', () => {
    const container = renderBody(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)"> <b onclick="alert(1)">b</b>\n\n'
        + '<iframe src="https://evil.example"></iframe><style>body{display:none}</style><a href="https://evil.example">html</a>',
    );

    expect(container.querySelector('script, img, iframe, style, b')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror|onclick|<script/i);
  });

  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox', '//evil.example'])(
    'drops a link to %s and keeps its text',
    (url) => {
      const container = renderBody(`[нажми](${url}) <${url}>`);

      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('нажми');
    },
  );

  it('keeps only the text of other Markdown: headings, images, lists and tables', () => {
    const container = renderBody('# Заголовок\n\n![картинка](https://example.com/a.png)\n\n- пункт\n\n| a |\n|---|\n| b |');

    expect(container.querySelector('h1, h2, img, ul, li, table')).toBeNull();
    expect(container.textContent).toContain('Заголовок');
    expect(container.textContent).toContain('пункт');
  });

  it('links a bare address and a site-relative path, both not followed', () => {
    const container = renderBody('См. https://example.com и [статью](/namaz-putnika).');

    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/', '/namaz-putnika']);
    expect(links.every((link) => link.getAttribute('rel')?.includes('nofollow ugc'))).toBe(true);
  });
});
