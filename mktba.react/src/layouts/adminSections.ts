import { Bot, FolderTree, KeyRound, LayoutDashboard, MonitorSmartphone, Tags, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import type { RolePolicy } from '../auth/roleAccess';

export type AdminSectionId = 'dashboard' | 'articles' | 'tags' | 'users' | 'sessions' | 'profile' | 'ai' | 'maintenance';

export type AdminSection = {
  id: AdminSectionId;
  /** The section's URL; the dashboard is the admin root. */
  path: string;
  /** The policy a role needs to see the section; the API checks it again on every request. */
  policy: RolePolicy;
  icon: LucideIcon;
};

/** The admin sections in menu order. An author sees the articles but not the AI settings or invitations. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'dashboard', path: '/admin', policy: 'canEditArticles', icon: LayoutDashboard },
  { id: 'articles', path: '/admin/articles', policy: 'canEditArticles', icon: FolderTree },
  { id: 'tags', path: '/admin/tags', policy: 'canEditAnyArticle', icon: Tags },
  { id: 'users', path: '/admin/users', policy: 'canManageUsers', icon: KeyRound },
  { id: 'sessions', path: '/admin/sessions', policy: 'authenticated', icon: MonitorSmartphone },
  { id: 'profile', path: '/admin/profile', policy: 'authenticated', icon: UserRound },
  { id: 'ai', path: '/admin/ai', policy: 'canConfigure', icon: Bot },
  { id: 'maintenance', path: '/admin/maintenance', policy: 'canConfigure', icon: Trash2 },
];

export const adminSectionPath = (id: AdminSectionId): string =>
  ADMIN_SECTIONS.find((section) => section.id === id)!.path;

/** Where the old single-page admin's `?section=` values now live, so bookmarked links keep working. */
const LEGACY_SECTION_PATHS: Record<string, string> = {
  articles: adminSectionPath('dashboard'),
  aiProvider: adminSectionPath('ai'),
  adminAccess: adminSectionPath('users'),
  sessions: adminSectionPath('sessions'),
  cleanup: adminSectionPath('maintenance'),
};

/** The page an old `/admin?section=…` link means, or undefined for a value it never had. */
export const legacySectionPath = (section: string | null): string | undefined =>
  section === null ? undefined : LEGACY_SECTION_PATHS[section];
