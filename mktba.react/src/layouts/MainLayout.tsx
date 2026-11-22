import React, { useCallback, useState } from 'react';
import {
  ChevronRight,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
} from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { ErrorBoundary } from '../components/ErrorBoundary';
import Sidebar from '../components/Sidebar';
import { useSidebar } from '../hooks/useSidebar';
import { useLocale } from '../localization/hooks';
import { logOut, useSession } from '../services/session';
import { FEEDBACK_PATH, feedbackHref } from '../shared/feedback';
import { Button } from '../shared/ui/Button';
import { MazhabSelector } from '../components/mazhab/MazhabSelector';
import { SearchDialog } from '../components/search/SearchDialog';
import { useSearchShortcut } from '../components/search/searchShortcut';

/** The public site: header, the article tree with search, and the page. Admin pages use `AdminLayout`. */
const MainLayout: React.FC = () => {
  const locale = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed, toggleCollapsed } = useSidebar();
  const isAdmin = useSession().accessToken !== null;
  const currentPath = location.pathname;
  // On the form itself the link keeps what the form was opened with; elsewhere it carries this page.
  const feedbackLink = currentPath === FEEDBACK_PATH
    ? `${FEEDBACK_PATH}${location.search}`
    : feedbackHref({ from: `${location.pathname}${location.search}` });
  const isCreateRoute = location.pathname === APP_CONSTANTS.ROUTES.ADD_ARTICLE;
  const [mobileSidebarState, setMobileSidebarState] = useState({ open: false, path: currentPath });
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const isMobileSidebarOpen = mobileSidebarState.open && mobileSidebarState.path === currentPath;
  // The dialog belongs to the page it was opened on: any navigation (the results page too) closes it.
  const [searchDialogKey, setSearchDialogKey] = useState<string | null>(null);
  const isSearchDialogOpen = searchDialogKey === location.key;
  const openSearchDialog = useCallback(() => setSearchDialogKey(location.key), [location.key]);
  useSearchShortcut(openSearchDialog);

  const handleExpandSidebarSearch = () => {
    if (!collapsed) {
      setSearchFocusRequest((current) => current + 1);
      return;
    }

    toggleCollapsed();
    setSearchFocusRequest((current) => current + 1);
  };

  const logoWidth = collapsed
    ? APP_CONSTANTS.DIMENSIONS.SIDEBAR_COLLAPSED_WIDTH
    : APP_CONSTANTS.DIMENSIONS.SIDEBAR_WIDTH;

  return (
    <div className="min-h-screen bg-page-bg text-ink-default">
      {/* Below `md` the header has no backdrop filter: a filter would make the header the containing block
          of the fixed mazhab bar inside it, and the bar must sit at the bottom of the viewport. */}
      <header className="print:hidden! sticky top-0 z-40 flex h-[var(--layout-header-height)] items-stretch border-b border-[var(--color-border-soft)] bg-white md:bg-[rgba(255,255,255,0.94)] md:backdrop-blur-md">
        <div
          className="hidden items-center border-r border-[var(--color-border-soft)] px-4 transition-[width] duration-200 lg:flex"
          style={{ width: logoWidth }}
        >
          <Link to="/" className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-[15px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
              {collapsed ? locale.brand.shortName : locale.brand.name}
            </span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-stretch">
          <div className="flex items-center border-r border-[var(--color-border-soft)] px-1 sm:px-3">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)] lg:flex"
              title={collapsed ? locale.layout.navigation.open : locale.layout.navigation.close}
              aria-label={collapsed ? locale.layout.navigation.open : locale.layout.navigation.close}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>

            {/* Below `lg` the brand column is hidden, so the brand itself leads home. */}
            <Link
              to="/"
              className="flex h-9 items-center rounded-lg px-2 text-[15px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)] lg:hidden"
            >
              {locale.brand.name}
            </Link>

            <Link
              to="/"
              className="ml-1 hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-brand-forest)] lg:flex"
              title={locale.layout.menu.home}
              aria-label={locale.layout.menu.home}
            >
              <Home size={16} />
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1 px-2 sm:gap-1.5 sm:px-4">
            <button
              type="button"
              onClick={openSearchDialog}
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K"
              title={locale.search.dialog.open}
              className="flex h-9 w-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-xs text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)] md:w-auto md:border-[var(--color-border-soft)] md:px-2.5"
            >
              <Search size={15} aria-hidden="true" />
              <span className="sr-only md:not-sr-only">{locale.search.dialog.open}</span>
              <kbd aria-hidden="true" className="hidden rounded border border-[var(--color-border-soft)] px-1 font-sans text-[10px] md:inline">
                {locale.search.dialog.shortcut}
              </kbd>
            </button>

            {/* One picker for every width: in the header from `md` up, below it a bar fixed to the bottom of
                the screen (R-11, #47); `md:contents` dissolves the bar into the header row. */}
            <div
              data-testid="mazhab-bar"
              className="fixed inset-x-0 bottom-0 z-40 flex min-h-[var(--layout-bottom-bar-height)] items-center justify-between gap-3 border-t border-[var(--color-border-soft)] bg-white px-4 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(28,27,24,0.06)] md:contents"
            >
              <span aria-hidden="true" className="text-[12px] font-semibold text-[var(--color-ink-muted)] md:hidden">
                {locale.layout.mazhabBar.label}
              </span>
              <MazhabSelector />
            </div>

            {isAdmin ? (
              <Button
                variant={isCreateRoute ? 'primary' : 'secondary'}
                className="hidden min-h-8 rounded-lg px-3 py-1.5 text-xs sm:inline-flex"
                onClick={() => navigate(APP_CONSTANTS.ROUTES.ADD_ARTICLE)}
              >
                <Plus size={13} />
                {locale.layout.menu.addArticle}
              </Button>
            ) : null}

            {isAdmin ? (
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
            ) : null}

              <button
                type="button"
                onClick={() => setMobileSidebarState((current) => ({ open: !current.open, path: currentPath }))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)] lg:hidden"
              title={collapsed ? locale.layout.navigation.open : locale.layout.navigation.close}
              aria-label={collapsed ? locale.layout.navigation.open : locale.layout.navigation.close}
            >
              {isMobileSidebarOpen ? <PanelLeftClose size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
        </div>
      </header>

      {isSearchDialogOpen && <SearchDialog onClose={() => setSearchDialogKey(null)} />}

      <div className="flex min-h-[calc(100vh-var(--layout-header-height))] pb-[calc(var(--layout-bottom-bar-height)+env(safe-area-inset-bottom))] md:pb-0 print:block print:min-h-0 print:pb-0">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarState({ open: false, path: currentPath })}
          searchFocusRequest={searchFocusRequest}
          onExpandSidebarSearch={handleExpandSidebarSearch}
        />
        <div className="flex flex-1 flex-col">
          <main className="flex-1">
            <ErrorBoundary resetKey={currentPath}>
              <Outlet />
            </ErrorBoundary>
          </main>
          <footer
            aria-label={locale.layout.footer.label}
            className="print:hidden! flex flex-col items-start gap-x-6 gap-y-2 border-t border-[var(--color-border-soft)] px-4 py-5 text-[13px] text-[var(--color-ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6"
            data-testid="site-footer"
          >
            <span>{locale.brand.sidebarCaption}</span>
            <Link to={feedbackLink} className="text-[var(--color-brand-forest)] hover:underline">
              {locale.layout.footer.feedback}
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
