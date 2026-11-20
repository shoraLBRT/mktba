import { describe, expect, it } from 'vitest';
import type { SourceDto } from '../../shared/types/ApiTypes';
import { createEmptyArticleDraft } from './articleDraft';
import { buildArticlePreviewContent } from './articlePreview';

const book: SourceDto = { id: 7, kind: 'Book', title: 'Аль-Хидая', author: null, details: null, url: null };

describe('buildArticlePreviewContent', () => {
  it('Given blocks without ids, When the preview content is built, Then paragraphs are numbered by position and empty blocks are dropped', () => {
    const content = buildArticlePreviewContent({
      ...createEmptyArticleDraft(),
      title: '  Намаз  ',
      blocks: [
        { id: 'a', kind: 'paragraph', content: 'Первый.' },
        { id: 'b', kind: 'paragraph', content: '   ' },
        { id: 'c', kind: 'heading2', content: 'Раздел' },
      ],
    });

    expect(content.title).toBe('Намаз');
    expect(content.paragraphs.map((paragraph) => [paragraph.id, paragraph.opinions[0].content])).toEqual([
      [1, 'Первый.'],
      [2, '## Раздел'],
    ]);
  });

  it('Given a block of opinions with one text left, When the preview content is built, Then it is a plain paragraph as the save would store it', () => {
    const content = buildArticlePreviewContent({
      ...createEmptyArticleDraft(),
      blocks: [{
        id: 'v',
        kind: 'versioned',
        variants: [
          { localId: '1', content: '', isDefault: true, schoolIds: [1] },
          { localId: '2', content: 'Единственное.', isDefault: false, schoolIds: [3] },
        ],
      }],
    });

    expect(content.paragraphs[0].opinions).toEqual([
      expect.objectContaining({ content: 'Единственное.', isDefault: true, schoolIds: [] }),
    ]);
  });

  it('Given a source cited twice, When the preview content is built, Then the directory entry is listed once', () => {
    const citation = { localId: 'c', source: book, locator: '' };
    const content = buildArticlePreviewContent({
      ...createEmptyArticleDraft(),
      blocks: [
        { id: 'a', kind: 'paragraph', content: 'Раз.', sources: [citation] },
        { id: 'b', kind: 'paragraph', content: 'Два.', sources: [{ ...citation, localId: 'd', locator: 'с. 5' }] },
      ],
    });

    expect(content.sources).toEqual([book]);
    expect(content.paragraphs[1].opinions[0].sources).toEqual([{ sourceId: 7, locator: 'с. 5' }]);
  });
});
