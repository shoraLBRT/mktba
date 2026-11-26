import { describe, expect, it } from 'vitest';
import { openRemarksByParagraph, remarkAnchorParts } from './articleRemarks';
import type { ArticleRemarkDto } from './types/ApiTypes';

const remark = (patch: Partial<ArticleRemarkDto>): ArticleRemarkDto => ({
  id: 1,
  articleId: 12,
  revisionNumber: 3,
  paragraphId: 21,
  opinionId: null,
  onOpinion: false,
  paragraphOrder: 2,
  currentParagraphOrder: 2,
  excerpt: '',
  blockRemoved: false,
  status: 'Open',
  isMine: false,
  createdAt: '2026-11-26T11:00:00Z',
  updatedAt: '2026-11-26T11:00:00Z',
  canReply: true,
  canClose: true,
  canReopen: false,
  messages: [],
  ...patch,
});

describe('openRemarksByParagraph', () => {
  it('given open, closed and deleted-block remarks, when grouped, then only the open ones on blocks still there count, an opinion for its paragraph', () => {
    const grouped = openRemarksByParagraph([
      remark({ id: 1 }),
      remark({ id: 2, onOpinion: true, opinionId: 5 }),
      remark({ id: 3, status: 'Resolved' }),
      remark({ id: 4, paragraphId: 30, blockRemoved: true }),
      remark({ id: 5, paragraphId: null, blockRemoved: true }),
    ]);

    expect([...grouped.entries()].map(([id, items]) => [id, items.map((item) => item.id)])).toEqual([[21, [1, 2]]]);
  });
});

describe('remarkAnchorParts', () => {
  it('given a moved, a deleted and an unmoved block, when read, then only a block still there reports where it is now', () => {
    expect(remarkAnchorParts(remark({ currentParagraphOrder: 4 }))).toEqual({ order: 2, movedTo: 4, removed: false });
    expect(remarkAnchorParts(remark({ blockRemoved: true, currentParagraphOrder: null }))).toEqual({ order: 2, movedTo: null, removed: true });
    expect(remarkAnchorParts(remark({}))).toEqual({ order: 2, movedTo: null, removed: false });
  });
});
