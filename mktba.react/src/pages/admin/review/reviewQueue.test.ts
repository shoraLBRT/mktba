import { describe, expect, it } from 'vitest';
import { canReturnWith, reviewComparisonOf } from './reviewQueue';

describe('reviewComparisonOf', () => {
  it('given a published article with newer revisions, then compares the published revision with the newest', () => {
    expect(reviewComparisonOf({ latestRevisionNumber: 5, publishedRevisionNumber: 3 })).toEqual({ kind: 'changes', from: 3, to: 5 });
  });

  it('given an article never published, then shows the newest revision as all new', () => {
    expect(reviewComparisonOf({ latestRevisionNumber: 2, publishedRevisionNumber: null })).toEqual({ kind: 'newArticle', revision: 2 });
  });

  it('given the newest revision is the published one, then there is nothing to compare', () => {
    expect(reviewComparisonOf({ latestRevisionNumber: 4, publishedRevisionNumber: 4 })).toEqual({ kind: 'unchanged', revision: 4 });
  });

  it('given an article without revisions, then says so', () => {
    expect(reviewComparisonOf({ latestRevisionNumber: 0 })).toEqual({ kind: 'noRevisions' });
  });
});

describe('canReturnWith', () => {
  it('given a blank comment, then the article cannot be returned', () => {
    expect(canReturnWith('   ')).toBe(false);
    expect(canReturnWith('Добавьте источники')).toBe(true);
  });
});
