import { describe, expect, it } from 'vitest';
import { buildArticleOutline } from './articleOutline';
import { parseMarkdownHeadings } from './markdownHeadings';

describe('parseMarkdownHeadings', () => {
  it('given headings at mixed levels, when parsed, then they come at the rendered levels with plain text', () => {
    const { headings, startsWithHeading } = parseMarkdownHeadings('# Условия **намаза**\n\nТекст\n\n### Ният [1](#x)');

    expect(headings).toEqual([
      { depth: 2, text: 'Условия намаза' },
      { depth: 3, text: 'Ният 1' },
    ]);
    expect(startsWithHeading).toBe(true);
  });

  it('given a # line inside a code block, when parsed, then it is not a heading', () => {
    const { headings, startsWithHeading } = parseMarkdownHeadings('Текст\n\n```\n# not a heading\n```');

    expect(headings).toEqual([]);
    expect(startsWithHeading).toBe(false);
  });
});

describe('buildArticleOutline', () => {
  it('given paragraphs, when outlined, then a paragraph anchor comes from its id, not its place', () => {
    const outline = buildArticleOutline([
      { paragraphId: 42, content: 'Первый' },
      { paragraphId: 7, content: 'Второй' },
    ]);

    expect(outline.map((paragraph) => paragraph.anchorId)).toEqual(['p-42', 'p-7']);
  });

  it('given Russian headings, when outlined, then their ids are the transliterated text', () => {
    const [paragraph] = buildArticleOutline([{ paragraphId: 1, content: '## Условия намаза\n\n### Ният' }]);

    expect(paragraph.headings).toEqual([
      { id: 'usloviya-namaza', text: 'Условия намаза', depth: 2 },
      { id: 'niyat', text: 'Ният', depth: 3 },
    ]);
  });

  it('given a heading repeated across paragraphs, when outlined, then later ones are numbered in reading order', () => {
    const outline = buildArticleOutline([
      { paragraphId: 1, content: '## Доводы' },
      { paragraphId: 2, content: '## Доводы\n\n## Доводы' },
    ]);

    expect(outline.flatMap((paragraph) => paragraph.headings.map((heading) => heading.id))).toEqual([
      'dovody',
      'dovody-2',
      'dovody-3',
    ]);
  });

  it('given a heading whose slug is a paragraph anchor or the overview, when outlined, then the id is not reused', () => {
    const [paragraph] = buildArticleOutline([{ paragraphId: 5, content: '## P 5\n\n## Article overview' }]);

    expect(paragraph.headings.map((heading) => heading.id)).toEqual(['p-5-2', 'article-overview-2']);
  });

  it('given a heading with nothing to transliterate, when outlined, then it falls back to "section"', () => {
    const [paragraph] = buildArticleOutline([{ paragraphId: 1, content: '## الصلاة\n\n## الزكاة' }]);

    expect(paragraph.headings.map((heading) => heading.id)).toEqual(['section', 'section-2']);
  });
});
