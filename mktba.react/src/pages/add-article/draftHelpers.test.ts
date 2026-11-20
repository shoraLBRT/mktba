import { describe, expect, it } from 'vitest';
import type { ParagraphDto } from '../../shared/types/ApiTypes';
import {
  buildDocumentPreviewMarkdown,
  buildParagraphCreateDtosFromBlocks,
  buildParagraphUpdateDtosFromBlocks,
  addVersionToBlock,
  canAssignSchools,
  convertParagraphToVersioned,
  changeEmptyBlockKind,
  convertVersionedToParagraph,
  createCitation,
  duplicateBlock,
  hasAnyFilledContent,
  hasVersionedBlockWithoutFilledDefault,
  importBlocksFromMarkdown,
  importBlocksFromParagraphs,
  insertBlockAfter,
  moveBlock,
  moveBlockTo,
  opinionsLostByConvertingToParagraph,
  opinionTabLabel,
  removeVersionFromBlock,
  setDefaultVersion,
  setOpinionSources,
  toggleOpinionSchool,
  uncoveredSchools,
} from './draftHelpers';
import type { EditorBlock, VersionedEditorBlock } from './types';

const paragraph = (id: string, content: string): EditorBlock => ({ id, kind: 'paragraph', content });
const hidaya = { id: 3, kind: 'Book' as const, title: 'Хидая' };

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

describe('schools on a block with a single opinion (S-14)', () => {
  it('given a block with one opinion, when checking, then schools cannot be assigned', () => {
    expect(canAssignSchools(versioned('s', [{ localId: 'only', content: 'text', isDefault: true }]))).toBe(false);
  });

  it('given a block with two opinions, when checking, then schools can be assigned', () => {
    expect(
      canAssignSchools(
        versioned('v', [
          { localId: 'x', content: 'a', isDefault: true },
          { localId: 'y', content: 'b', isDefault: false },
        ]),
      ),
    ).toBe(true);
  });

  it('given two opinions with schools, when one is removed, then the remaining opinion loses its schools', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'a', isDefault: true, schoolIds: [1] },
      { localId: 'y', content: 'b', isDefault: false, schoolIds: [2] },
    ]);

    const [next] = removeVersionFromBlock([block], 'v', 'y') as VersionedEditorBlock[];

    expect(next.variants).toEqual([expect.objectContaining({ localId: 'x', schoolIds: [] })]);
  });

  const onlyDefaultFilled = versioned('v', [
    { localId: 'x', content: 'общее', isDefault: true, schoolIds: [1] },
    { localId: 'y', content: '   ', isDefault: false, schoolIds: [2] },
  ]);

  it('given several opinions but only one with text, when building create DTOs, then it is sent as a plain paragraph without schools', () => {
    expect(buildParagraphCreateDtosFromBlocks([onlyDefaultFilled])).toEqual([
      { articleId: 0, order: 1, opinions: [{ content: 'общее', isDefault: true, schoolIds: [], sources: [] }] },
    ]);
  });

  it('given several opinions but only one with text, when building update DTOs, then it is sent as a plain paragraph without schools', () => {
    expect(buildParagraphUpdateDtosFromBlocks([{ ...onlyDefaultFilled, paragraphId: 3 }])).toEqual([
      { id: 3, order: 1, opinions: [{ id: 0, content: 'общее', isDefault: true, schoolIds: [], sources: [] }] },
    ]);
  });

  it('given three opinions with schools, when one is removed, then the others keep their schools', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'a', isDefault: true, schoolIds: [1] },
      { localId: 'y', content: 'b', isDefault: false, schoolIds: [2] },
      { localId: 'z', content: 'c', isDefault: false, schoolIds: [3] },
    ]);

    const [next] = removeVersionFromBlock([block], 'v', 'z') as VersionedEditorBlock[];

    expect(next.variants.map((variant) => variant.schoolIds)).toEqual([[1], [2]]);
  });
});

describe('convertParagraphToVersioned and convertVersionedToParagraph', () => {
  it('given a plain paragraph, when converting to versioned, then its content becomes the default variant and an empty opinion follows', () => {
    const [next] = convertParagraphToVersioned(
      [{ id: 'p', kind: 'paragraph', content: 'текст', paragraphId: 7, opinionId: 70 }],
      'p',
    ) as VersionedEditorBlock[];

    expect(next).toMatchObject({ id: 'p', kind: 'versioned', paragraphId: 7 });
    expect(next.variants).toHaveLength(2);
    expect(next.variants[0]).toMatchObject({ content: 'текст', isDefault: true, opinionId: 70, schoolIds: [] });
    expect(next.variants[1]).toMatchObject({ content: '', isDefault: false, schoolIds: [] });
    expect(next.variants[1].opinionId).toBeUndefined();
  });

  it('given a versioned block, when converting to a paragraph, then keeps the default variant content', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'other', isDefault: false },
      { localId: 'y', content: 'chosen', isDefault: true },
    ]);

    expect(convertVersionedToParagraph([block], 'v')[0]).toMatchObject({ kind: 'paragraph', content: 'chosen' });
  });

  it('given other opinions with text or citations, when counting what a paragraph would drop, then counts those opinions only', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'ханафи', isDefault: true, schoolIds: [1] },
      { localId: 'y', content: 'шафии', isDefault: false, schoolIds: [3] },
      { localId: 'z', content: '   ', isDefault: false },
    ]);
    const withCitation: VersionedEditorBlock = {
      ...block,
      variants: [...block.variants, { localId: 'w', content: '', isDefault: false, schoolIds: [], sources: [createCitation(hidaya)] }],
    };

    expect(opinionsLostByConvertingToParagraph(block)).toBe(1);
    expect(opinionsLostByConvertingToParagraph(withCitation)).toBe(2);
  });

  it('given only the default opinion filled, when counting, then nothing would be lost', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'текст', isDefault: true },
      { localId: 'y', content: '', isDefault: false },
    ]);

    expect(opinionsLostByConvertingToParagraph(block)).toBe(0);
  });

  it('given a block of opinions with school links, when converted to a paragraph and saved, then no school id is sent', () => {
    const block = versioned('v', [
      { localId: 'x', content: 'ханафи', isDefault: true, schoolIds: [1] },
      { localId: 'y', content: 'шафии', isDefault: false, schoolIds: [3] },
    ]);

    const [dto] = buildParagraphCreateDtosFromBlocks(convertVersionedToParagraph([block], 'v'));

    expect(dto.opinions).toEqual([expect.objectContaining({ content: 'ханафи', isDefault: true, schoolIds: [] })]);
  });
});

describe('duplicateBlock', () => {
  it('given a saved paragraph, when duplicated, then a new paragraph with the same text and citations follows it without the ids', () => {
    const original: EditorBlock = { id: 'a', kind: 'paragraph', content: 'текст', paragraphId: 7, opinionId: 70, sources: [createCitation(hidaya, 'с. 5')] };
    const blocks: EditorBlock[] = [original, paragraph('b', 'дальше')];

    const next = duplicateBlock(blocks, 'a');

    expect(next).toHaveLength(3);
    expect(next[0]).toBe(original);
    expect(next[2]).toBe(blocks[1]);
    const copy = next[1];
    expect(copy).toMatchObject({ kind: 'paragraph', content: 'текст', sources: [{ locator: 'с. 5', source: hidaya }] });
    expect(copy.id).not.toBe('a');
    expect(copy.paragraphId).toBeUndefined();
    expect(copy.kind !== 'versioned' ? copy.opinionId : 0).toBeUndefined();
    expect(copy.kind !== 'versioned' ? copy.sources?.[0].localId : '').not.toBe(original.sources?.[0].localId);
  });

  it('given a block of opinions, when duplicated, then the copy has every opinion with its schools and none of the ids', () => {
    const block: VersionedEditorBlock = {
      ...versioned('v', [
        { localId: 'x', content: 'ханафи', isDefault: true, schoolIds: [1] },
        { localId: 'y', content: 'шафии', isDefault: false, schoolIds: [3] },
      ]),
      paragraphId: 9,
    };
    block.variants[0].opinionId = 90;

    const [, copy] = duplicateBlock([block], 'v') as VersionedEditorBlock[];

    expect(copy.paragraphId).toBeUndefined();
    expect(copy.variants.map((variant) => [variant.content, variant.isDefault, variant.schoolIds, variant.opinionId])).toEqual([
      ['ханафи', true, [1], undefined],
      ['шафии', false, [3], undefined],
    ]);
    expect(copy.variants.map((variant) => variant.localId)).not.toContain('x');
  });

  it('given an unknown block, when duplicated, then the list is unchanged', () => {
    const blocks = [paragraph('a', 'x')];

    expect(duplicateBlock(blocks, 'missing')).toBe(blocks);
  });
});

describe('moveBlockTo', () => {
  const blocks = [paragraph('a', '1'), paragraph('b', '2'), paragraph('c', '3'), paragraph('d', '4')];

  it('given a block dropped before another, when moved, then it lands right above it', () => {
    expect(ids(moveBlockTo(blocks, 'd', 'b', 'before'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('given a block dropped after another, when moved, then it lands right below it', () => {
    expect(ids(moveBlockTo(blocks, 'a', 'c', 'after'))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('given a drop that keeps the order, when moved, then the same list comes back', () => {
    expect(moveBlockTo(blocks, 'b', 'a', 'after')).toBe(blocks);
    expect(moveBlockTo(blocks, 'b', 'b', 'before')).toBe(blocks);
    expect(moveBlockTo(blocks, 'missing', 'a', 'before')).toBe(blocks);
  });
});

describe('changeEmptyBlockKind', () => {
  it('given an empty saved paragraph, when it becomes a heading, then it keeps its place and ids', () => {
    const blocks: EditorBlock[] = [paragraph('a', 'x'), { id: 'b', kind: 'paragraph', content: '/h2', paragraphId: 5, opinionId: 50 }];

    const next = changeEmptyBlockKind(blocks, 'b', 'heading2');

    expect(next[0]).toBe(blocks[0]);
    expect(next[1]).toEqual({ id: 'b', kind: 'heading2', content: '', paragraphId: 5, opinionId: 50 });
  });

  it('given an empty paragraph, when it becomes a block of opinions, then it starts with a default and a second empty opinion', () => {
    const [next] = changeEmptyBlockKind([{ id: 'b', kind: 'paragraph', content: '/' }], 'b', 'versioned') as VersionedEditorBlock[];

    expect(next.kind).toBe('versioned');
    expect(next.variants.map((variant) => [variant.content, variant.isDefault])).toEqual([['', true], ['', false]]);
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
      { articleId: 0, order: 1, opinions: [{ content: '## Заголовок', isDefault: true, schoolIds: [], sources: [] }] },
      { articleId: 0, order: 2, opinions: [{ content: 'текст', isDefault: true, schoolIds: [], sources: [] }] },
      { articleId: 0, order: 3, opinions: [{ content: 'ханафи', isDefault: true, schoolIds: [], sources: [] }] },
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
      { id: 5, order: 1, opinions: [{ id: 50, content: '### Раздел', isDefault: true, schoolIds: [], sources: [] }] },
      { id: 0, order: 2, opinions: [{ id: 0, content: 'новый абзац', isDefault: true, schoolIds: [], sources: [] }] },
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
          { id: 21, content: 'мнение А', isDefault: true, schoolIds: [1], sources: [] },
          { id: 22, content: 'мнение Б', isDefault: false, schoolIds: [2], sources: [] },
        ],
      },
      { id: 1, order: 1, opinions: [{ id: 11, content: '## Введение', isDefault: true, schoolIds: [], sources: [] }] },
    ];

    const blocks = importBlocksFromParagraphs(paragraphs);

    expect(blocks[0]).toMatchObject({ kind: 'heading2', content: 'Введение', paragraphId: 1, opinionId: 11 });
    expect(blocks[1]).toMatchObject({ kind: 'versioned', paragraphId: 2 });
    expect((blocks[1] as VersionedEditorBlock).variants.map((variant) => variant.opinionId)).toEqual([21, 22]);
  });

  it('given round-tripped blocks, when rebuilding update DTOs, then the server content is preserved', () => {
    const paragraphs: ParagraphDto[] = [
      { id: 1, order: 1, opinions: [{ id: 11, content: '### Итог', isDefault: true, schoolIds: [], sources: [] }] },
    ];

    expect(buildParagraphUpdateDtosFromBlocks(importBlocksFromParagraphs(paragraphs))).toEqual(paragraphs);
  });
});

describe('citations', () => {
  const bukhari = { id: 1, kind: 'HadithCollection' as const, title: 'Сахих', author: 'аль-Бухари' };
  const quran = { id: 2, kind: 'Quran' as const, title: 'Коран' };

  it('given saved citations, when imported and rebuilt, then every opinion keeps its sources, order and locators', () => {
    const paragraphs: ParagraphDto[] = [
      { id: 1, order: 1, opinions: [{ id: 11, content: 'Абзац', isDefault: true, schoolIds: [], sources: [{ sourceId: 2, locator: '2:255' }, { sourceId: 1, locator: null }] }] },
      {
        id: 2,
        order: 2,
        opinions: [
          { id: 21, content: 'мнение А', isDefault: true, schoolIds: [1], sources: [{ sourceId: 1, locator: '№ 52' }] },
          { id: 22, content: 'мнение Б', isDefault: false, schoolIds: [2], sources: [] },
        ],
      },
    ];

    const blocks = importBlocksFromParagraphs(paragraphs, [bukhari, quran]);

    expect(buildParagraphUpdateDtosFromBlocks(blocks)).toEqual(paragraphs);
    expect(buildParagraphCreateDtosFromBlocks(blocks)[0].opinions[0].sources).toEqual([{ sourceId: 2, locator: '2:255' }, { sourceId: 1, locator: null }]);
  });

  it('given a plain paragraph and a version, when their sources are set, then only the addressed opinion changes', () => {
    const blocks = [
      paragraph('p', 'текст'),
      versioned('v', [
        { localId: 'a', content: 'А', isDefault: true },
        { localId: 'b', content: 'Б', isDefault: false },
      ]),
    ];

    const withPlain = setOpinionSources(blocks, 'p', null, [createCitation(quran, ' 1:1 ')]);
    const withBoth = setOpinionSources(withPlain, 'v', 'b', [createCitation(bukhari)]);

    const [plainDto, versionedDto] = buildParagraphCreateDtosFromBlocks(withBoth);
    expect(plainDto.opinions[0].sources).toEqual([{ sourceId: 2, locator: '1:1' }]);
    expect(versionedDto.opinions.map((opinion) => opinion.sources)).toEqual([[], [{ sourceId: 1, locator: null }]]);
  });

  it('given a paragraph with sources, when converted to a block of opinions and back, then the sources stay with the text', () => {
    const blocks = setOpinionSources([paragraph('p', 'текст')], 'p', null, [createCitation(bukhari, '№ 1')]);

    const versionedBlocks = convertParagraphToVersioned(blocks, 'p');
    const back = convertVersionedToParagraph(versionedBlocks, 'p');

    expect(buildParagraphCreateDtosFromBlocks(versionedBlocks)[0].opinions[0].sources).toEqual([{ sourceId: 1, locator: '№ 1' }]);
    expect(buildParagraphCreateDtosFromBlocks(back)[0].opinions[0].sources).toEqual([{ sourceId: 1, locator: '№ 1' }]);
  });

  it('given a heading holding sources, when saved, then it sends none', () => {
    const heading: EditorBlock = { id: 'h', kind: 'heading2', content: 'Глава', sources: [createCitation(quran)] };

    expect(buildParagraphCreateDtosFromBlocks([heading])[0].opinions[0].sources).toEqual([]);
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

describe('opinions named by school (E-06)', () => {
  const schools = [
    { id: 1, shortName: 'Хан' },
    { id: 2, shortName: 'Мал' },
    { id: 3, shortName: 'Шаф' },
    { id: 4, shortName: 'Ханб' },
  ];
  const texts = { common: 'Общее мнение', noSchool: 'Без мазхаба' };
  const block = () =>
    versioned('v', [
      { localId: 'x', content: 'a', isDefault: true, schoolIds: [1] },
      { localId: 'y', content: 'b', isDefault: false, schoolIds: [3, 2] },
    ]);
  const variantsOf = (blocks: EditorBlock[]) => (blocks[0] as VersionedEditorBlock).variants;

  it('given opinions with and without schools, when labelled, then the label is the short names, else common for the default and no school otherwise', () => {
    const [first, second] = block().variants;
    expect(opinionTabLabel(second, schools, texts)).toBe('Шаф, Мал');
    expect(opinionTabLabel({ ...first, schoolIds: [] }, schools, texts)).toBe('Общее мнение');
    expect(opinionTabLabel({ ...second, schoolIds: [] }, schools, texts)).toBe('Без мазхаба');
    expect(opinionTabLabel({ ...second, schoolIds: [99] }, schools, texts)).toBe('Без мазхаба');
  });

  it('given a block, when its uncovered schools are asked, then the schools no opinion has are listed in order; one opinion covers none', () => {
    expect(uncoveredSchools(block(), schools).map((school) => school.id)).toEqual([4]);
    expect(uncoveredSchools(versioned('s', [{ localId: 'o', content: 'a', isDefault: true }]), schools)).toHaveLength(4);
  });

  it('given a school, when an opinion is added for it, then the new opinion has it, is not the default and takes it from another opinion', () => {
    const next = variantsOf(addVersionToBlock([block()], 'v', [2], 'z'));
    expect(next.map(({ localId, schoolIds, isDefault, content }) => ({ localId, schoolIds, isDefault, content }))).toEqual([
      { localId: 'x', schoolIds: [1], isDefault: true, content: 'a' },
      { localId: 'y', schoolIds: [3], isDefault: false, content: 'b' },
      { localId: 'z', schoolIds: [2], isDefault: false, content: '' },
    ]);
  });

  it('given a school, when toggled on an opinion, then it is linked there and unlinked from any other; toggled again, it is unlinked', () => {
    const moved = toggleOpinionSchool([block()], 'v', 'x', 3);
    expect(variantsOf(moved).map((variant) => variant.schoolIds)).toEqual([[1, 3], [2]]);
    expect(variantsOf(toggleOpinionSchool(moved, 'v', 'x', 1)).map((variant) => variant.schoolIds)).toEqual([[3], [2]]);
  });

  it('given an unknown opinion, when a school is toggled, then the blocks are unchanged', () => {
    const blocks = [block()];
    expect(toggleOpinionSchool(blocks, 'v', 'missing', 4)[0]).toBe(blocks[0]);
  });
});
