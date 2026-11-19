import type { UserRole } from '../shared/types/ApiTypes';

/**
 * What each role may do, mirroring the API's named policies (Mktba.Api/Infrastructure/Policies.cs).
 * The API enforces them; the UI only hides what a role cannot use. Which articles an author may
 * edit is per article (U-02): the API says so in the tree's `canEdit` and in `allowedTransitions`.
 */
const POLICY_ROLES = {
  /** Create new articles, and edit, read the history of and submit their own. */
  canEditArticles: ['Author', 'Admin'],
  /** Edit any article, and what no author may do even with their own: delete, move in the tree, change authorship. */
  canEditAnyArticle: ['Admin'],
  /** Make any status move, publication included (authors only submit and take back their own). */
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
