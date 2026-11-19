import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ArticlePage from '../pages/ArticlePage';
import AddArticlePage from '../pages/AddArticlePage';
import AdminLoginPage from '../pages/AdminLoginPage';
import ArticleHistoryPage from '../pages/ArticleHistoryPage';
import EditArticlePage from '../pages/EditArticlePage';
import NotFoundPage from '../pages/NotFoundPage';
import WelcomePage from '../pages/WelcomePage';
import AdminAiSettingsPage from '../pages/admin/AdminAiSettingsPage';
import AdminArticlesPage from '../pages/admin/AdminArticlesPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminMaintenancePage from '../pages/admin/AdminMaintenancePage';
import AdminSessionsPage from '../pages/admin/AdminSessionsPage';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import { ErrorBoundary } from '../components/ErrorBoundary';
import AdminLayout from '../layouts/AdminLayout';
import { AdminIndexRoute, AdminSectionRoute } from '../layouts/AdminRouteGuards';
import MainLayout from '../layouts/MainLayout';
import { ADMIN_SECTIONS, type AdminSectionId } from '../layouts/adminSections';
import { useSession } from '../services/session';
import { APP_CONSTANTS } from '../constants/AppConstants';

const ADD_ARTICLE_PATH = APP_CONSTANTS.ROUTES.ADD_ARTICLE;

/** The page of each admin section in the menu; the dashboard is the index route. */
const SECTION_PAGES: Record<AdminSectionId, ReactElement> = {
  dashboard: <AdminDashboardPage />,
  articles: <AdminArticlesPage />,
  users: <AdminUsersPage />,
  sessions: <AdminSessionsPage />,
  ai: <AdminAiSettingsPage />,
  maintenance: <AdminMaintenancePage />,
};

/** Signed-in pages; after a reload it waits for the session to be restored from the refresh cookie. */
const AdminOnlyRoute = ({ children }: { children: ReactElement }) => {
  const session = useSession();
  if (session.restoring) {
    return null;
  }

  if (!session.accessToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

/**
 * Every page of the app: the public site in `MainLayout`, the signed-in `/admin/*` pages in
 * `AdminLayout`. A render error in a page shows the error fallback until the route changes.
 */
export const AppRoutes = () => {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/article/new" element={<Navigate to={ADD_ARTICLE_PATH} replace />} />
          <Route path="/article/:slug" element={<ArticlePage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/admin" element={<AdminOnlyRoute><AdminLayout /></AdminOnlyRoute>}>
          <Route index element={<AdminIndexRoute dashboard={SECTION_PAGES.dashboard} />} />
          {ADMIN_SECTIONS.filter((section) => section.id !== 'dashboard').map((section) => (
            <Route
              key={section.id}
              path={section.path}
              element={<AdminSectionRoute policy={section.policy}>{SECTION_PAGES[section.id]}</AdminSectionRoute>}
            />
          ))}
          <Route
            path={ADD_ARTICLE_PATH}
            element={<AdminSectionRoute policy="canEditArticles" padded={false}><AddArticlePage /></AdminSectionRoute>}
          />
          <Route
            path="/admin/articles/:articleId/edit"
            element={<AdminSectionRoute policy="canEditArticles" padded={false}><EditArticlePage /></AdminSectionRoute>}
          />
          <Route
            path="/admin/articles/:articleId/history"
            element={<AdminSectionRoute policy="canEditArticles" padded={false}><ArticleHistoryPage /></AdminSectionRoute>}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
};
