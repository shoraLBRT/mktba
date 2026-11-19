import type { UserRole } from '../shared/types/ApiTypes';

/**
 * What each role may do, mirroring the API's named policies (Mktba.Api/Infrastructure/Policies.cs).
 * The API enforces them; the UI only hides what a role cannot use.
 */
const POLICY_ROLES = {
  /** Create new articles. */
  canEditArticles: ['Author', 'Admin'],
  /** Change, review the history of, or delete any article (authors' own articles: #30). */
  canEditAnyArticle: ['Admin'],
  /** Move articles between statuses, publication included. */
  canReviewArticles: ['Admin'],
  /** List users and invite new ones. */
  canManageUsers: ['Admin'],
  /** AI provider settings and maintenance. */
  canConfigure: ['Admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type RolePolicy = keyof typeof POLICY_ROLES;

/** Whether `role` passes `policy`; an unknown role (not loaded yet, signed out) passes nothing. */
export const roleAllows = (role: UserRole | undefined, policy: RolePolicy): boolean =>
  role !== undefined && (POLICY_ROLES[policy] as readonly UserRole[]).includes(role);
