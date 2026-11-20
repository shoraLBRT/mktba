import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import ArticleEditorPage from '../pages/ArticleEditorPage';
import ArticleHistoryPage from '../pages/ArticleHistoryPage';
import NotFoundPage from '../pages/NotFoundPage';
import AdminAiSettingsPage from '../pages/admin/AdminAiSettingsPage';
import AdminArticlesPage from '../pages/admin/AdminArticlesPage';
import AdminArticleTreePage from '../pages/admin/AdminArticleTreePage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminMaintenancePage from '../pages/admin/AdminMaintenancePage';
import AdminProfilePage from '../pages/admin/AdminProfilePage';
import AdminSessionsPage from '../pages/admin/AdminSessionsPage';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import AdminLayout from '../layouts/AdminLayout';
import { AdminIndexRoute, AdminSectionRoute } from '../layouts/AdminRouteGuards';
import { ADMIN_SECTIONS, type AdminSectionId } from '../layouts/adminSections';
import { useSession } from '../services/session';
import { useHydrated } from '../shared/useHydrated';
import { APP_CONSTANTS } from '../constants/AppConstants';

/** The page of each admin section in the menu; the dashboard is the index route. */
const SECTION_PAGES: Record<AdminSectionId, ReactElement> = {
  dashboard: <AdminDashboardPage />,
  articles: <AdminArticlesPage />,
  users: <AdminUsersPage />,
  sessions: <AdminSessionsPage />,
  profile: <AdminProfilePage />,
  ai: <AdminAiSettingsPage />,
  maintenance: <AdminMaintenancePage />,
};

/** These routes sit under the `admin/*` route, so their paths are relative to `/admin`. */
const underAdmin = (path: string) => path.replace(/^\/admin\/?/, '');

/**
 * Signed-in pages; after a reload it waits for the session to be restored from the refresh cookie.
 * While the page hydrates, `useSession` still reports the server's anonymous session, so it waits
 * for that too.
 */
const AdminOnlyRoute = ({ children }: { children: ReactElement }) => {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated || session.restoring) {
    return null;
  }

  if (!session.accessToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

/**
 * The signed-in `/admin/*` pages in `AdminLayout`. Rendered only in the browser (see
 * `routes/admin.tsx`); `/admin/login` is a public page.
 */
export const AdminRoutes = () => (
  <Routes>
    <Route element={<AdminOnlyRoute><AdminLayout /></AdminOnlyRoute>}>
      <Route index element={<AdminIndexRoute dashboard={SECTION_PAGES.dashboard} />} />
      {ADMIN_SECTIONS.filter((section) => section.id !== 'dashboard').map((section) => (
        <Route
          key={section.id}
          path={underAdmin(section.path)}
          element={<AdminSectionRoute policy={section.policy}>{SECTION_PAGES[section.id]}</AdminSectionRoute>}
        />
      ))}
      <Route
        path="articles/tree"
        element={<AdminSectionRoute policy="canEditArticles"><AdminArticleTreePage /></AdminSectionRoute>}
      />
      <Route
        path={underAdmin(APP_CONSTANTS.ROUTES.ADD_ARTICLE)}
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleEditorPage /></AdminSectionRoute>}
      />
      <Route
        path="articles/:articleId/edit"
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleEditorPage /></AdminSectionRoute>}
      />
      <Route
        path="articles/:articleId/history"
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleHistoryPage /></AdminSectionRoute>}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes>
);
