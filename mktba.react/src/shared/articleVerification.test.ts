import { describe, expect, it } from 'vitest';
import { groupMarksByMazhab, reviewersOf, summarizeMarks } from './articleVerification';
import type { ArticleVerificationMarkDto } from './types/ApiTypes';

const mark = (overrides: Partial<ArticleVerificationMarkDto>): ArticleVerificationMarkDto => ({
  scholarName: null,
  scholarSlug: null,
  verdict: 'Confirmed',
  mazhab: null,
  revisionNumber: 2,
  reviewedAt: '2026-11-26T10:00:00Z',
  isLatestRevision: true,
  isCurrent: true,
  ...overrides,
});

describe('reviewersOf (V-08, #124)', () => {
  it('given current confirmations, when read, then the named ones are the reviewers and stale or nameless ones are not', () => {
    expect(reviewersOf([
      mark({ scholarName: 'Абдулла', scholarSlug: 'abdulla', reviewedAt: '2026-11-26T10:00:00Z' }),
      mark({ scholarName: 'Юсуф', verdict: 'ConfirmedWithRemarks', mazhab: 'hanafi', reviewedAt: '2026-11-20T10:00:00Z' }),
      mark({ scholarName: null }),
      mark({ scholarName: 'Карим', isCurrent: false, isLatestRevision: false }),
      mark({ scholarName: 'Хасан', verdict: 'HasErrors', isCurrent: false, isLatestRevision: false }),
    ])).toEqual([
      { name: 'Абдулла', slug: 'abdulla', reviewedAt: '2026-11-26T10:00:00Z' },
      { name: 'Юсуф', slug: null, reviewedAt: '2026-11-20T10:00:00Z' },
    ]);
  });

  it('given a current «есть ошибки», when read, then nobody is named, as the article is not verified', () => {
    expect(reviewersOf([mark({ scholarName: 'Абдулла' }), mark({ verdict: 'HasErrors' })])).toEqual([]);
    expect(reviewersOf([])).toEqual([]);
  });
});

describe('articleVerification', () => {
  it('given marks on the latest and an earlier revision, when summarized, then remarks count as confirmed and earlier marks apart', () => {
    const summary = summarizeMarks([
      mark({ verdict: 'Confirmed' }),
      mark({ verdict: 'ConfirmedWithRemarks' }),
      mark({ verdict: 'HasErrors' }),
      mark({ verdict: 'Confirmed', isLatestRevision: false, isCurrent: false, revisionNumber: 1 }),
      mark({ verdict: 'HasErrors', isLatestRevision: false, isCurrent: false, revisionNumber: 1 }),
    ]);

    expect(summary).toEqual({ confirmed: 2, errors: 1, previous: 2 });
  });

  it('given a mark of an earlier revision that no substantial edit followed, when summarized, then it counts as current', () => {
    const summary = summarizeMarks([mark({ verdict: 'HasErrors', isLatestRevision: false, isCurrent: true, revisionNumber: 1 })]);

    expect(summary).toEqual({ confirmed: 0, errors: 1, previous: 0 });
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
