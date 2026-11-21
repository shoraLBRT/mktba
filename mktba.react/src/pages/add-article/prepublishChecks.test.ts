import { describe, expect, it } from 'vitest';
import { findPrepublishWarnings, isPublishingMove } from './prepublishChecks';
import type { AlternativeDraft, EditorBlock } from './types';

const snippet = { title: 'Намаз', description: 'Описание' };
const paragraph = (id: string, content: string): EditorBlock => ({ id, kind: 'paragraph', content });
const opinion = (localId: string, content: string, isDefault = false, schoolIds: number[] = []): AlternativeDraft => ({
  localId,
  content,
  isDefault,
  schoolIds,
});
const opinions = (id: string, variants: AlternativeDraft[]): EditorBlock => ({ id, kind: 'versioned', variants });

describe('findPrepublishWarnings', () => {
  it('given filled blocks, a description and a short title, when checked, then there is nothing to warn about', () => {
    const blocks = [
      paragraph('a', 'Текст'),
      opinions('b', [opinion('b1', 'Общее', true), opinion('b2', 'Ханафиты', false, [1])]),
    ];

    expect(findPrepublishWarnings(blocks, snippet, [])).toEqual([]);
  });

  it('given an empty paragraph, heading and block of opinions, when checked, then each is an empty block with its number', () => {
    const blocks = [
      paragraph('a', 'Текст'),
      { id: 'h', kind: 'heading2', content: '  ' } as EditorBlock,
      paragraph('p', ''),
      opinions('o', [opinion('o1', '', true), opinion('o2', '')]),
    ];

    expect(findPrepublishWarnings(blocks, snippet, [])).toEqual([
      { code: 'emptyBlock', blockId: 'h', blockNumber: 2 },
      { code: 'emptyBlock', blockId: 'p', blockNumber: 3 },
      { code: 'emptyBlock', blockId: 'o', blockNumber: 4 },
    ]);
  });

  it('given a block of opinions with an empty default, when checked, then it is a missing default, not an empty opinion', () => {
    const blocks = [opinions('o', [opinion('o1', '', true), opinion('o2', 'Шафииты', false, [3])])];

    expect(findPrepublishWarnings(blocks, snippet, [])).toEqual([{ code: 'defaultMissing', blockId: 'o', blockNumber: 1 }]);
  });

  it('given an empty further opinion and one without a school, when checked, then both are named with the opinion', () => {
    const blocks = [
      opinions('o', [opinion('o1', 'Общее', true), opinion('o2', ''), opinion('o3', 'Маликиты'), opinion('o4', 'Ханбалиты', false, [4])]),
    ];

    expect(findPrepublishWarnings(blocks, snippet, [])).toEqual([
      { code: 'emptyOpinion', localId: 'o2', blockId: 'o', blockNumber: 1 },
      { code: 'opinionWithoutSchool', localId: 'o3', blockId: 'o', blockNumber: 1 },
    ]);
  });

  it('given a block with one filled opinion and no schools, when checked, then it is not flagged: it is saved as a plain paragraph', () => {
    const blocks = [opinions('o', [opinion('o1', 'Общее', true), opinion('o2', '')])];

    expect(findPrepublishWarnings(blocks, snippet, []).map((warning) => warning.code)).toEqual(['emptyOpinion']);
  });

  it('given broken internal links, when checked, then each block with them is one warning with the count', () => {
    const blocks = [paragraph('a', 'Текст'), paragraph('b', 'Ещё')];
    const links = [
      { blockId: 'b', slug: 'net', problem: 'missing' as const },
      { blockId: 'b', slug: 'chernovik', problem: 'unpublished' as const },
    ];

    expect(findPrepublishWarnings(blocks, snippet, links)).toEqual([{ code: 'brokenLinks', count: 2, blockId: 'b', blockNumber: 2 }]);
  });

  it('given no description and a title over 70 characters, when checked, then both are reported after the blocks', () => {
    const title = 'Н'.repeat(71);

    expect(findPrepublishWarnings([paragraph('p', '')], { title, description: null }, [])).toEqual([
      { code: 'emptyBlock', blockId: 'p', blockNumber: 1 },
      { code: 'descriptionMissing' },
      { code: 'titleTooLong', length: 71, maxLength: 70 },
    ]);
  });

  it('given a title of exactly 70 characters, when checked, then it fits', () => {
    expect(findPrepublishWarnings([paragraph('a', 'Текст')], { ...snippet, title: 'Н'.repeat(70) }, [])).toEqual([]);
  });
});

describe('isPublishingMove', () => {
  it('given each status, when asked, then only review and publication put the article in front of others', () => {
    expect(['Draft', 'InReview', 'Published', 'Archived'].filter(isPublishingMove)).toEqual(['InReview', 'Published']);
  });
});
