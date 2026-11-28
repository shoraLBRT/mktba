import { describe, expect, it } from 'vitest';
import { roleAllows } from './roleAccess';

describe('roleAllows', () => {
  it('given an admin, when checking every policy, then all pass', () => {
    for (const policy of ['canEditArticles', 'canEditAnyArticle', 'canReviewArticles', 'canManageUsers', 'canConfigure', 'canViewSiteAnalytics', 'canViewAuditLog', 'canModerateComments'] as const) {
      expect(roleAllows('Admin', policy)).toBe(true);
    }
  });

  it('given an author, when checking policies, then only creating articles passes', () => {
    expect(roleAllows('Author', 'canEditArticles')).toBe(true);
    expect(roleAllows('Author', 'canEditAnyArticle')).toBe(false);
    expect(roleAllows('Author', 'canConfigure')).toBe(false);
    expect(roleAllows('Author', 'canManageUsers')).toBe(false);
    expect(roleAllows('Author', 'canViewSiteAnalytics')).toBe(false);
    expect(roleAllows('Author', 'canViewAuditLog')).toBe(false);
  });

  it('given a reader or scholar, when checking editorial policies, then none pass', () => {
    expect(roleAllows('Reader', 'canEditArticles')).toBe(false);
    expect(roleAllows('Scholar', 'canEditArticles')).toBe(false);
  });

  it('given no role yet, when checking any policy, then it fails closed', () => {
    expect(roleAllows(undefined, 'canEditArticles')).toBe(false);
  });
});
