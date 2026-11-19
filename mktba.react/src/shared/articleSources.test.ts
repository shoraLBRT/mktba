import { describe, expect, it } from 'vitest';
import { collectCitedSources, sourceLabel } from './articleSources';
import type { OpinionSourceDto, ParagraphDto, SourceDto } from './types/ApiTypes';

const bukhari: SourceDto = { id: 1, kind: 'HadithCollection', title: 'Сахих', author: 'аль-Бухари' };
const quran: SourceDto = { id: 2, kind: 'Quran', title: 'Коран' };

const paragraph = (id: number, order: number, ...opinions: OpinionSourceDto[][]): ParagraphDto => ({
  id,
  order,
  opinions: opinions.map((sources, index) => ({ id: id * 10 + index, content: 'текст', isDefault: index === 0, schoolIds: [], sources })),
});

describe('collectCitedSources', () => {
  it('given citations in several paragraphs, when collected, then each source is listed once in the order of first citation', () => {
    const paragraphs = [
      paragraph(20, 2, [{ sourceId: 1, locator: '№ 52' }]),
      paragraph(10, 1, [{ sourceId: 2, locator: '2:255' }, { sourceId: 1, locator: '№ 1' }]),
    ];

    expect(collectCitedSources(paragraphs, [bukhari, quran])).toEqual([
      { source: quran, citations: [{ paragraphId: 10, locator: '2:255' }] },
      { source: bukhari, citations: [{ paragraphId: 10, locator: '№ 1' }, { paragraphId: 20, locator: '№ 52' }] },
    ]);
  });

  it('given opinions of different schools citing sources, when collected, then every opinion counts, not only the default one', () => {
    const paragraphs = [paragraph(10, 1, [{ sourceId: 1, locator: '№ 1' }], [{ sourceId: 2 }])];

    expect(collectCitedSources(paragraphs, [bukhari, quran]).map((cited) => cited.source.id)).toEqual([1, 2]);
  });

  it('given two opinions of one paragraph citing the same place, when collected, then it is listed once', () => {
    const paragraphs = [paragraph(10, 1, [{ sourceId: 2, locator: null }], [{ sourceId: 2 }, { sourceId: 2, locator: '1:1' }])];

    expect(collectCitedSources(paragraphs, [quran])).toEqual([
      { source: quran, citations: [{ paragraphId: 10, locator: null }, { paragraphId: 10, locator: '1:1' }] },
    ]);
  });

  it('given a citation of a source the article does not carry, when collected, then it is skipped', () => {
    expect(collectCitedSources([paragraph(10, 1, [{ sourceId: 9 }])], [quran])).toEqual([]);
  });
});

describe('sourceLabel', () => {
  it('given an author, puts it before the title; without one, gives the title alone', () => {
    expect(sourceLabel(bukhari)).toBe('аль-Бухари. Сахих');
    expect(sourceLabel(quran)).toBe('Коран');
  });
});
