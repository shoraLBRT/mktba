import { describe, expect, it } from 'vitest';
import { canSubmitReview, reviewNeedsComment, scopeSnapshot } from './articleReview';
import type { ArticleSnapshotDto } from './types/ApiTypes';

const snapshot: ArticleSnapshotDto = {
  schemaVersion: 3,
  title: 'Намаз',
  slug: 'namaz',
  tags: [],
  relatedLinks: [],
  paragraphs: [
    { order: 1, opinions: [{ content: 'Общий абзац', isDefault: true, schoolIds: [] }] },
    {
      order: 2,
      opinions: [
        { content: 'Ханафиты', isDefault: false, schoolIds: [1] },
        { content: 'По умолчанию', isDefault: true, schoolIds: [3, 4] },
        { content: 'Маликиты', isDefault: false, schoolIds: [2] },
      ],
    },
  ],
};

const contents = (value: ArticleSnapshotDto) => value.paragraphs.map((paragraph) => paragraph.opinions.map((opinion) => opinion.content));

describe('scopeSnapshot', () => {
  it('keeps the whole revision without a school', () => {
    expect(scopeSnapshot(snapshot, null)).toBe(snapshot);
  });

  it("keeps the common paragraphs and the school's own opinion", () => {
    expect(contents(scopeSnapshot(snapshot, 2))).toEqual([['Общий абзац'], ['Маликиты']]);
  });

  it('falls back to the default opinion where the school has none', () => {
    expect(contents(scopeSnapshot(snapshot, 99))).toEqual([['Общий абзац'], ['По умолчанию']]);
  });
});

describe('review form rules', () => {
  it('needs a comment for remarks and errors only', () => {
    expect(reviewNeedsComment('Confirmed')).toBe(false);
    expect(reviewNeedsComment('ConfirmedWithRemarks')).toBe(true);
    expect(canSubmitReview('Confirmed', '')).toBe(true);
    expect(canSubmitReview('HasErrors', '  ')).toBe(false);
    expect(canSubmitReview('HasErrors', 'Неверная ссылка')).toBe(true);
    expect(canSubmitReview(null, 'текст')).toBe(false);
  });
});
