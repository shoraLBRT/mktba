import React, { useState } from 'react';
import { Home, LogOut, Menu, Plus, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useCurrentUser } from '../auth/useCurrentUser';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { logOut } from '../services/session';
import { cn } from '../shared/lib/cn';
import { Button } from '../shared/ui/Button';
import { ADMIN_SECTIONS } from './adminSections';

type AdminNavProps = {
  onNavigate?: () => void;
};

/** The sections the signed-in role may open; nothing until the role is known. */
const AdminNav: React.FC<AdminNavProps> = ({ onNavigate }) => {
  const locale = useLocale();
  const { can } = useCurrentUser();

  return (
    <nav aria-label={locale.adminLayout.navLabel} className="space-y-1 p-3">
      {ADMIN_SECTIONS.filter((section) => can(section.policy)).map(({ id, path, icon: Icon }) => (
        <NavLink
          key={id}
          to={path}
          end={path === '/admin'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-[var(--color-brand-forest)] bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]'
                : 'border-transparent text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink-strong)]',
            )
          }
        >
          <Icon size={17} className="shrink-0" />
          <span className="min-w-0">{locale.adminLayout.sections[id]}</span>
        </NavLink>
      ))}
    </nav>
  );
};

/**
 * Every signed-in `/admin/*` page: a header with the user and logout, a menu of the sections the
 * role may open (a drawer behind a menu button on narrow screens), and the page. The public tree
 * and search stay on the public site.
 */
const AdminLayout: React.FC = () => {
  const locale = useLocale();
  const t = locale.adminLayout;
  const navigate = useNavigate();
  const currentPath = useLocation().pathname;
  const { user, role, can } = useCurrentUser();
  // The drawer belongs to the page it was opened on, so following a link closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const isMenuOpen = menuOpenOn === currentPath;
  const closeMenu = () => setMenuOpenOn(null);

  return (
    <div className="min-h-screen bg-[var(--color-page-bg)] text-ink-default">
      <header className="sticky top-0 z-40 flex h-[var(--layout-header-height)] items-center gap-2 border-b border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.94)] px-2 backdrop-blur-md sm:px-4">
        <button
          type="button"
          onClick={() => setMenuOpenOn(isMenuOpen ? null : currentPath)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)] lg:hidden"
          aria-label={isMenuOpen ? t.menuClose : t.menuOpen}
          aria-expanded={isMenuOpen}
          title={isMenuOpen ? t.menuClose : t.menuOpen}
        >
          {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <Link to="/admin" className="flex min-w-0 items-baseline gap-2 leading-none">
          <span className="truncate text-[15px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
            {locale.brand.name}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-forest)]">
            {t.title}
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {can('canEditArticles') ? (
            <Button
              variant={currentPath === APP_CONSTANTS.ROUTES.ADD_ARTICLE ? 'primary' : 'secondary'}
              className="hidden min-h-8 rounded-lg px-3 py-1.5 text-xs sm:inline-flex"
              onClick={() => navigate(APP_CONSTANTS.ROUTES.ADD_ARTICLE)}
            >
              <Plus size={13} />
              {locale.layout.menu.addArticle}
            </Button>
          ) : null}

          {user && role ? (
            <div className="hidden min-w-0 flex-col items-end leading-tight md:flex" data-testid="admin-current-user">
              <span className="max-w-[220px] truncate text-xs font-medium text-[var(--color-ink-strong)]">{user.email}</span>
              <span className="text-[11px] text-[var(--color-ink-subtle)]">{locale.userRole[role]}</span>
            </div>
          ) : null}

          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-brand-forest)]"
            title={t.toSite}
            aria-label={t.toSite}
          >
            <Home size={16} />
          </Link>

          <Button
            variant="ghost"
            className="min-h-8 rounded-lg px-2 py-1.5 text-xs"
            onClick={async () => {
              await logOut();
              navigate('/');
            }}
            aria-label={locale.layout.actions.logout}
            title={locale.layout.actions.logout}
          >
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-var(--layout-header-height))]">
        <div className="sticky top-[var(--layout-header-height)] hidden h-[calc(100vh-var(--layout-header-height))] w-[var(--layout-sidebar-width)] shrink-0 overflow-y-auto border-r border-[var(--color-border-soft)] bg-[var(--color-surface)] lg:block">
          <AdminNav />
        </div>

        {isMenuOpen ? (
          <div className="fixed inset-0 top-[var(--layout-header-height)] z-30 lg:hidden">
            <button
              type="button"
              aria-label={t.menuClose}
              onClick={closeMenu}
              className="absolute inset-0 bg-[rgba(20,20,18,0.35)] backdrop-blur-sm"
            />
            <div className="absolute left-0 top-0 h-full w-[min(82vw,280px)] overflow-y-auto border-r border-[var(--color-border-soft)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(28,27,24,0.16)]">
              <AdminNav onNavigate={closeMenu} />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">
          <ErrorBoundary resetKey={currentPath}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
