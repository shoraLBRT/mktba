import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import ArticleEditorPage from '../pages/ArticleEditorPage';
import ArticleHistoryPage from '../pages/ArticleHistoryPage';
import NotFoundPage from '../pages/NotFoundPage';
import AdminAiSettingsPage from '../pages/admin/AdminAiSettingsPage';
import AdminArticleAnalyticsPage from '../pages/admin/AdminArticleAnalyticsPage';
import AdminArticlesPage from '../pages/admin/AdminArticlesPage';
import AdminArticleTreePage from '../pages/admin/AdminArticleTreePage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminMyArticlesPage from '../pages/admin/AdminMyArticlesPage';
import AdminMaintenancePage from '../pages/admin/AdminMaintenancePage';
import AdminProfilePage from '../pages/admin/AdminProfilePage';
import AdminReviewArticlePage from '../pages/admin/AdminReviewArticlePage';
import AdminReviewQueuePage from '../pages/admin/AdminReviewQueuePage';
import AdminSessionsPage from '../pages/admin/AdminSessionsPage';
import AdminTagsPage from '../pages/admin/AdminTagsPage';
import AdminTrashPage from '../pages/admin/AdminTrashPage';
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
  mine: <AdminMyArticlesPage />,
  tags: <AdminTagsPage />,
  review: <AdminReviewQueuePage />,
  users: <AdminUsersPage />,
  sessions: <AdminSessionsPage />,
  profile: <AdminProfilePage />,
  ai: <AdminAiSettingsPage />,
  trash: <AdminTrashPage />,
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
 * The signed-in `/admin/*` pages in `AdminLayout`; the article editor in the same layout without
 * the menu of sections, so it has the whole width (E-15, #85). Rendered only in the browser (see
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
        path="review/:articleId"
        element={<AdminSectionRoute policy="canReviewArticles"><AdminReviewArticlePage /></AdminSectionRoute>}
      />
      <Route
        path="articles/:articleId/history"
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleHistoryPage /></AdminSectionRoute>}
      />
      <Route
        path="articles/:articleId/analytics"
        element={<AdminSectionRoute policy="canEditArticles"><AdminArticleAnalyticsPage /></AdminSectionRoute>}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route element={<AdminOnlyRoute><AdminLayout withSections={false} /></AdminOnlyRoute>}>
      <Route
        path={underAdmin(APP_CONSTANTS.ROUTES.ADD_ARTICLE)}
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleEditorPage /></AdminSectionRoute>}
      />
      <Route
        path="articles/:articleId/edit"
        element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleEditorPage /></AdminSectionRoute>}
      />
    </Route>
  </Routes>
);
