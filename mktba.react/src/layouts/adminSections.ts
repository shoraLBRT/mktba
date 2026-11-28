import { ArchiveRestore, BadgeCheck, Bell, Bot, ClipboardCheck, ClipboardList, FolderTree, GraduationCap, KeyRound, LayoutDashboard, MessageSquareWarning, MonitorSmartphone, NotebookPen, ScrollText, Tags, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import type { RolePolicy } from '../auth/roleAccess';

export type AdminSectionId = 'dashboard' | 'articles' | 'mine' | 'tags' | 'review' | 'comments' | 'users' | 'scholarReview' | 'articleReviews' | 'sessions' | 'notifications' | 'profile' | 'scholar' | 'ai' | 'trash' | 'audit' | 'maintenance';

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
  { id: 'mine', path: '/admin/my-articles', policy: 'canEditArticles', icon: NotebookPen },
  { id: 'tags', path: '/admin/tags', policy: 'canEditAnyArticle', icon: Tags },
  { id: 'review', path: '/admin/review', policy: 'canReviewArticles', icon: ClipboardCheck },
  // C-02 (#128): comments held for moderation, reported or hidden, and comment bans.
  { id: 'comments', path: '/admin/comments', policy: 'canModerateComments', icon: MessageSquareWarning },
  { id: 'users', path: '/admin/users', policy: 'canManageUsers', icon: KeyRound },
  // V-02 (#118): the admin's review of scholar applications.
  { id: 'scholarReview', path: '/admin/scholar-applications', policy: 'canManageUsers', icon: BadgeCheck },
  // V-03 (#119): a scholar reviews published articles; an admin sees the pages but gives no verdict.
  { id: 'articleReviews', path: '/admin/article-reviews', policy: 'canVerify', icon: ScrollText },
  { id: 'sessions', path: '/admin/sessions', policy: 'authenticated', icon: MonitorSmartphone },
  // V-09 (#125): every role gets notifications; the header's bell leads here too.
  { id: 'notifications', path: '/admin/notifications', policy: 'authenticated', icon: Bell },
  { id: 'profile', path: '/admin/profile', policy: 'authenticated', icon: UserRound },
  // V-01 (#117): any signed-in role sees its application; only readers and authors may apply (the page says so).
  { id: 'scholar', path: '/admin/scholar-application', policy: 'authenticated', icon: GraduationCap },
  { id: 'ai', path: '/admin/ai', policy: 'canConfigure', icon: Bot },
  { id: 'trash', path: '/admin/trash', policy: 'canEditAnyArticle', icon: ArchiveRestore },
  { id: 'audit', path: '/admin/audit', policy: 'canViewAuditLog', icon: ClipboardList },
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
