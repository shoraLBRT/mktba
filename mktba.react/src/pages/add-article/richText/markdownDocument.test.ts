import { describe, expect, it } from 'vitest';
import { documentToMarkdown, markdownToDocument, normalizeMarkdown, RAW_BLOCK, RAW_INLINE } from './markdownDocument';

const roundTrip = (markdown: string) => documentToMarkdown(markdownToDocument(markdown));

describe('markdownToDocument', () => {
  it('given formatted text, when parsed, then the editor gets its marks, links and breaks', () => {
    const doc = markdownToDocument('Это **жирный**, _курсив_, ~~зачёркнуто~~, `код` и [ссылка](/namaz "Намаз").  \nСтрока');

    expect(doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Это ' },
          { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
          { type: 'text', text: ', ' },
          { type: 'text', text: 'курсив', marks: [{ type: 'italic' }] },
          { type: 'text', text: ', ' },
          { type: 'text', text: 'зачёркнуто', marks: [{ type: 'strike' }] },
          { type: 'text', text: ', ' },
          { type: 'text', text: 'код', marks: [{ type: 'code' }] },
          { type: 'text', text: ' и ' },
          { type: 'text', text: 'ссылка', marks: [{ type: 'link', attrs: { href: '/namaz', title: 'Намаз' } }] },
          { type: 'text', text: '.' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Строка' },
        ],
      },
    ]);
  });

  it('given a soft line break, when parsed, then it is the space the reader sees', () => {
    expect(markdownToDocument('первая\nвторая').content?.[0].content).toEqual([{ type: 'text', text: 'первая вторая' }]);
  });

  it('given a table and footnotes, when parsed, then they keep their source as raw Markdown', () => {
    const doc = markdownToDocument('Текст[^1] и [ref][r].\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[^1]: Сноска.\n\n[r]: /namaz');

    expect(doc.content?.[0].content).toEqual([
      { type: 'text', text: 'Текст' },
      { type: RAW_INLINE, attrs: { source: '[^1]' } },
      { type: 'text', text: ' и ' },
      { type: RAW_INLINE, attrs: { source: '[ref][r]' } },
      { type: 'text', text: '.' },
    ]);
    expect(doc.content?.slice(1).map((node) => [node.type, node.content?.[0].text])).toEqual([
      [RAW_BLOCK, '| a | b |\n| - | - |\n| 1 | 2 |'],
      [RAW_BLOCK, '[^1]: Сноска.'],
      [RAW_BLOCK, '[r]: /namaz'],
    ]);
  });

  it('given a list holding a task item, when parsed, then the whole list stays raw Markdown', () => {
    const doc = markdownToDocument('- [ ] сделать\n- готово');

    expect(doc.content).toEqual([{ type: RAW_BLOCK, content: [{ type: 'text', text: '- [ ] сделать\n- готово' }] }]);
  });

  it('given an empty text, when parsed, then the editor gets one empty paragraph', () => {
    expect(markdownToDocument('').content).toEqual([{ type: 'paragraph' }]);
  });
});

describe('documentToMarkdown', () => {
  it.each([
    ['paragraphs', 'Первый абзац.\n\nВторой абзац.'],
    ['marks', 'Это **жирный**, *курсив*, ~~зачёркнуто~~ и `код`.'],
    ['nested marks', '***оба*** и **жирный *с курсивом* внутри**'],
    ['links', '[Намаз](/namaz) и [сайт](https://example.com "Заголовок") и [пробел](<a b>)'],
    ['hard breaks', 'строка\\\nследующая'],
    ['headings', '## Раздел\n\n### Подраздел'],
    ['bullet lists', '- один\n- два\n  - вложенный\n- три'],
    ['ordered lists', '3. три\n4. четыре'],
    ['quotes', '> цитата\n>\n> второй абзац'],
    ['code blocks', '```js\nconst a = 1;\n```'],
    ['rules', 'выше\n\n---\n\nниже'],
    ['raw blocks', '| a |\n| - |\n| 1 |\n\n[^1]: Сноска.'],
    ['raw inline', 'Текст[^1] и ![картинка](/a.png).\n\n[^1]: Сноска.'],
    ['literal syntax', 'звёздочка \\* и \\_подчёркивание\\_ и \\[скобки\\] и snake_case'],
    ['line-start syntax', '\\# не заголовок\n\n1990\\. год\n\n\\- не список'],
  ])('given %s, when written back, then the Markdown is the same', (_name, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('given text the user typed with Markdown characters, when written, then they stay text', () => {
    const markdown = documentToMarkdown({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '# 2 * 3 = [6] <b> ~x~ &amp;' }] }],
    });

    expect(markdownToDocument(markdown).content?.[0].content).toEqual([{ type: 'text', text: '# 2 * 3 = [6] <b> ~x~ &amp;' }]);
  });

  it('given a mark with spaces at its edges, when written, then the spaces move outside the mark', () => {
    const markdown = documentToMarkdown({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'а' }, { type: 'text', text: ' б ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'в' }] }],
    });

    expect(markdown).toBe('а **б** в');
  });

  it('given empty paragraphs, when written, then they are dropped', () => {
    expect(documentToMarkdown({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'а' }] }, { type: 'paragraph' }] })).toBe('а');
  });
});

describe('normalizeMarkdown', () => {
  it.each([
    'Обычный _курсив_ и __жирный__ и * список',
    'Список:\n* один\n* два\n\n1) первый',
    'Текст\nс мягким переносом и www.example.com',
    '~~~\nкод\n~~~',
    'Заголовок\n=========',
  ])('given %j, when normalised twice, then the second pass changes nothing', (markdown) => {
    const normalized = normalizeMarkdown(markdown);

    expect(normalizeMarkdown(normalized)).toBe(normalized);
  });
});
