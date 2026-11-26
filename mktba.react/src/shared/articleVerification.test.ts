import { describe, expect, it } from 'vitest';
import { groupMarksByMazhab, summarizeMarks } from './articleVerification';
import type { ArticleVerificationMarkDto } from './types/ApiTypes';

const mark = (overrides: Partial<ArticleVerificationMarkDto>): ArticleVerificationMarkDto => ({
  scholarName: null,
  scholarSlug: null,
  verdict: 'Confirmed',
  mazhab: null,
  revisionNumber: 2,
  reviewedAt: '2026-11-26T10:00:00Z',
  isLatestRevision: true,
  ...overrides,
});

describe('articleVerification', () => {
  it('given marks on the latest and an earlier revision, when summarized, then remarks count as confirmed and earlier marks apart', () => {
    const summary = summarizeMarks([
      mark({ verdict: 'Confirmed' }),
      mark({ verdict: 'ConfirmedWithRemarks' }),
      mark({ verdict: 'HasErrors' }),
      mark({ verdict: 'Confirmed', isLatestRevision: false, revisionNumber: 1 }),
      mark({ verdict: 'HasErrors', isLatestRevision: false, revisionNumber: 1 }),
    ]);

    expect(summary).toEqual({ confirmed: 2, errors: 1, previous: 2 });
  });

  it('given marks of several scopes, when grouped, then the whole article comes first and the madhabs in the given order', () => {
    const groups = groupMarksByMazhab(
      [mark({ mazhab: 'shafii' }), mark({ mazhab: 'unknown' }), mark({}), mark({ mazhab: 'hanafi' }), mark({ mazhab: 'shafii', revisionNumber: 1 })],
      ['hanafi', 'maliki', 'shafii', 'hanbali'],
    );

    expect(groups.map((group) => [group.mazhab, group.marks.length])).toEqual([
      [null, 1],
      ['hanafi', 1],
      ['shafii', 2],
      ['unknown', 1],
    ]);
    expect(groups[2].marks.map((item) => item.revisionNumber)).toEqual([2, 1]);
  });
});
