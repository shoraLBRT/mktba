import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ArticlePage from '../pages/ArticlePage';
import AddArticlePage from '../pages/AddArticlePage';
import AdminLoginPage from '../pages/AdminLoginPage';
import AdminPage from '../pages/AdminPage';
import EditArticlePage from '../pages/EditArticlePage';
import NotFoundPage from '../pages/NotFoundPage';
import WelcomePage from '../pages/WelcomePage';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { isAdminAuthenticated } from '../services/authService';
import { APP_CONSTANTS } from '../constants/AppConstants';

const ADD_ARTICLE_PATH = APP_CONSTANTS.ROUTES.ADD_ARTICLE;

const AdminOnlyRoute = ({ children }: { children: ReactElement }) => {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

/** Every page of the app. A render error in a page shows the error fallback until the route changes. */
export const AppRoutes = () => {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/article/new" element={<Navigate to={ADD_ARTICLE_PATH} replace />} />
        <Route path="/article/:slug" element={<ArticlePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminOnlyRoute><AdminPage /></AdminOnlyRoute>} />
        <Route path={ADD_ARTICLE_PATH} element={<AdminOnlyRoute><AddArticlePage /></AdminOnlyRoute>} />
        <Route
          path="/admin/articles/:articleId/edit"
          element={<AdminOnlyRoute><EditArticlePage /></AdminOnlyRoute>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
};
