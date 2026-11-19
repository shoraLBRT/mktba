import { describe, expect, it } from 'vitest';
import type { ParagraphDto } from '../../shared/types/ApiTypes';
import {
  buildDocumentPreviewMarkdown,
  buildParagraphCreateDtosFromBlocks,
  buildParagraphUpdateDtosFromBlocks,
  convertParagraphToVersioned,
  convertVersionedToParagraph,
  hasAnyFilledContent,
  hasVersionedBlockWithoutFilledDefault,
  importBlocksFromMarkdown,
  importBlocksFromParagraphs,
  insertBlockAfter,
  moveBlock,
  removeVersionFromBlock,
  setDefaultVersion,
} from './draftHelpers';
import type { EditorBlock, VersionedEditorBlock } from './types';

const paragraph = (id: string, content: string): EditorBlock => ({ id, kind: 'paragraph', content });

const versioned = (
  id: string,
  variants: Array<{ localId: string; content: string; isDefault: boolean; schoolIds?: number[] }>,
): VersionedEditorBlock => ({
  id,
  kind: 'versioned',
  variants: variants.map((variant) => ({ schoolIds: [], ...variant })),
});

const ids = (blocks: EditorBlock[]) => blocks.map((block) => block.id);

describe('moveBlock', () => {
  const blocks = [paragraph('a', '1'), paragraph('b', '2'), paragraph('c', '3')];

  it('given a middle block, when moved up, then swaps it with the previous one', () => {
    expect(ids(moveBlock(blocks, 'b', -1))).toEqual(['b', 'a', 'c']);
  });

  it('given the last block, when moved down, then returns the list unchanged', () => {
    expect(moveBlock(blocks, 'c', 1)).toBe(blocks);
  });

  it('given an unknown block id, when moved, then returns the list unchanged', () => {
    expect(moveBlock(blocks, 'missing', 1)).toBe(blocks);
  });
});

describe('insertBlockAfter', () => {
  const blocks = [paragraph('a', '1'), paragraph('b', '2')];

  it('given an existing block, when inserting after it, then the new block follows it', () => {
    const next = insertBlockAfter(blocks, 'a', 'heading2');

    expect(next).toHaveLength(3);
    expect(next[0].id).toBe('a');
    expect(next[1].kind).toBe('heading2');
    expect(next[2].id).toBe('b');
  });

  it('given an unknown block id, when inserting, then appends the new block', () => {
    const next = insertBlockAfter(blocks, 'missing', 'versioned');
    const added = next[2] as VersionedEditorBlock;

    expect(added.kind).toBe('versioned');
    expect(added.variants).toHaveLength(1);
    expect(added.variants[0].isDefault).toBe(true);
  });
});

describe('setDefaultVersion and removeVersionFromBlock', () => {
  const block = versioned('v', [
    { localId: 'x', content: 'first', isDefault: true },
    { localId: 'y', content: 'second', isDefault: false },
  ]);

  it('given a versioned block, when setting a default, then exactly that variant is default', () => {
    const [next] = setDefaultVersion([block], 'v', 'y') as VersionedEditorBlock[];

    expect(next.variants.map((variant) => variant.isDefault)).toEqual([false, true]);
  });

  it('given the default variant removed, when removing, then the first remaining variant becomes default', () => {
    const [next] = removeVersionFromBlock([block], 'v', 'x') as VersionedEditorBlock[];

    expect(next.variants).toHaveLength(1);
    expect(next.variants[0]).toMatchObject({ localId: 'y', isDefault: true });
  });

  it('given a block with a single variant, when removing it, then the block is unchanged', () => {
    const single = versioned('s', [{ localId: 'only', content: 'text', isDefault: true }]);

    expect(removeVersionFromBlock([single], 's', 'only')[0]).toBe(single);
  });
});

describe('convertParagraphToVersioned and convertVersionedToParagraph', () => {
  it('given a plain paragraph, when converting to versioned, then its content becomes the default variant', () => {
    const [next] = convertParagraphToVersioned(
      [{ id: 'p', kind: 'paragraph', content: 'текст', paragraphId: 7, opinionId: 70 }],
      'p',
    ) as VersionedEditorBlock[];

    expect(next).toMatchObject({ id: 'p', kind: 'versioned', paragraphId: 7 });
    expect(next.variants).toHaveLength(1);
    expect(next.variants[0]).toMatchObject({ content: 'текст', isDefault: true, opinionId: 70, schoolIds: [] });
  });

  it('given a versioned block, when converting to a paragraph, then keeps the default variant content', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'other', isDefault: false },
      { localId: 'y', content: 'chosen', isDefault: true },
    ]);

    expect(convertVersionedToParagraph([block], 'v')[0]).toMatchObject({ kind: 'paragraph', content: 'chosen' });
  });
});

describe('buildParagraphCreateDtosFromBlocks', () => {
  it('given mixed blocks, when building, then stores headings as markdown and keeps block order', () => {
    const blocks: EditorBlock[] = [
      { id: 'h', kind: 'heading2', content: ' Заголовок ' },
      paragraph('p', '  текст  '),
      versioned('v', [
        { localId: 'x', content: 'ханафи', isDefault: true, schoolIds: [1] },
        { localId: 'y', content: '   ', isDefault: false, schoolIds: [2] },
      ]),
    ];

    expect(buildParagraphCreateDtosFromBlocks(blocks)).toEqual([
      { articleId: 0, order: 1, opinions: [{ content: '## Заголовок', isDefault: true, schoolIds: [] }] },
      { articleId: 0, order: 2, opinions: [{ content: 'текст', isDefault: true, schoolIds: [] }] },
      { articleId: 0, order: 3, opinions: [{ content: 'ханафи', isDefault: true, schoolIds: [1] }] },
    ]);
  });

  it('given only empty blocks, when building, then returns no paragraphs', () => {
    const blocks: EditorBlock[] = [
      paragraph('p', '   '),
      versioned('v', [{ localId: 'x', content: '', isDefault: true }]),
    ];

    expect(buildParagraphCreateDtosFromBlocks(blocks)).toEqual([]);
  });
});

describe('buildParagraphUpdateDtosFromBlocks', () => {
  it('given blocks loaded from the server, when building, then keeps paragraph and opinion ids', () => {
    const blocks: EditorBlock[] = [
      { id: 'p', kind: 'heading3', content: 'Раздел', paragraphId: 5, opinionId: 50 },
      paragraph('new', 'новый абзац'),
    ];

    expect(buildParagraphUpdateDtosFromBlocks(blocks)).toEqual([
      { id: 5, order: 1, opinions: [{ id: 50, content: '### Раздел', isDefault: true, schoolIds: [] }] },
      { id: 0, order: 2, opinions: [{ id: 0, content: 'новый абзац', isDefault: true, schoolIds: [] }] },
    ]);
  });
});

describe('importBlocksFromParagraphs', () => {
  it('given server paragraphs out of order, when importing, then sorts them and detects block kinds', () => {
    const paragraphs: ParagraphDto[] = [
      {
        id: 2,
        order: 2,
        opinions: [
          { id: 21, content: 'мнение А', isDefault: true, schoolIds: [1] },
          { id: 22, content: 'мнение Б', isDefault: false, schoolIds: [2] },
        ],
      },
      { id: 1, order: 1, opinions: [{ id: 11, content: '## Введение', isDefault: true, schoolIds: [] }] },
    ];

    const blocks = importBlocksFromParagraphs(paragraphs);

    expect(blocks[0]).toMatchObject({ kind: 'heading2', content: 'Введение', paragraphId: 1, opinionId: 11 });
    expect(blocks[1]).toMatchObject({ kind: 'versioned', paragraphId: 2 });
    expect((blocks[1] as VersionedEditorBlock).variants.map((variant) => variant.opinionId)).toEqual([21, 22]);
  });

  it('given round-tripped blocks, when rebuilding update DTOs, then the server content is preserved', () => {
    const paragraphs: ParagraphDto[] = [
      { id: 1, order: 1, opinions: [{ id: 11, content: '### Итог', isDefault: true, schoolIds: [] }] },
    ];

    expect(buildParagraphUpdateDtosFromBlocks(importBlocksFromParagraphs(paragraphs))).toEqual(paragraphs);
  });
});

describe('importBlocksFromMarkdown', () => {
  it('given markdown with blank-line separated parts, when importing, then creates one block per part', () => {
    const blocks = importBlocksFromMarkdown('## Глава\n\n### Раздел\n\n\n  Абзац\nвторая строка  ');

    expect(blocks.map((block) => block.kind)).toEqual(['heading2', 'heading3', 'paragraph']);
    expect(blocks.map((block) => (block.kind === 'versioned' ? null : block.content))).toEqual([
      'Глава',
      'Раздел',
      'Абзац\nвторая строка',
    ]);
  });

  it('given only whitespace, when importing, then returns no blocks', () => {
    expect(importBlocksFromMarkdown(' \n\n \n')).toEqual([]);
  });
});

describe('content checks', () => {
  it('given a versioned block whose default variant is empty, when checking, then reports a missing default', () => {
    const blocks = [
      versioned('v', [
        { localId: 'x', content: '  ', isDefault: true },
        { localId: 'y', content: 'filled', isDefault: false },
      ]),
    ];

    expect(hasVersionedBlockWithoutFilledDefault(blocks)).toBe(true);
    expect(hasAnyFilledContent(blocks)).toBe(true);
  });

  it('given only blank blocks, when checking, then reports no filled content', () => {
    expect(hasAnyFilledContent([paragraph('p', ' '), versioned('v', [{ localId: 'x', content: '', isDefault: true }])])).toBe(false);
  });

  it('given mixed blocks, when building the preview, then shows only default variants', () => {
    const blocks: EditorBlock[] = [
      { id: 'h', kind: 'heading2', content: 'Глава' },
      versioned('v', [
        { localId: 'x', content: 'не по умолчанию', isDefault: false },
        { localId: 'y', content: 'по умолчанию', isDefault: true },
      ]),
    ];

    expect(buildDocumentPreviewMarkdown(blocks)).toBe('## Глава\n\nпо умолчанию');
  });
});
