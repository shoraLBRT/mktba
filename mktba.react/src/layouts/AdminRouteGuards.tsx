import type { ReactElement } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import type { RolePolicy } from '../auth/roleAccess';
import { useCurrentUser } from '../auth/useCurrentUser';
import AdminForbiddenPage from '../pages/admin/AdminForbiddenPage';
import { ADMIN_SECTIONS, legacySectionPath } from './adminSections';

type AdminSectionRouteProps = {
  policy: RolePolicy;
  children: ReactElement;
  /** False for pages with their own full-width layout, such as the editor. */
  padded?: boolean;
};

/** A page that needs `policy`: waits for the role, then renders the page or the 403 view. */
export const AdminSectionRoute = ({ policy, children, padded = true }: AdminSectionRouteProps) => {
  const { role, can } = useCurrentUser();
  if (role === undefined) {
    return null;
  }

  const page = can(policy) ? children : <AdminForbiddenPage />;
  return padded ? <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">{page}</div> : page;
};

/**
 * `/admin`: sends an old `?section=` link to its page, and a role without the dashboard to the
 * first section it may open; everyone else gets the dashboard.
 */
export const AdminIndexRoute = ({ dashboard }: { dashboard: ReactElement }) => {
  const [searchParams] = useSearchParams();
  const { role, can } = useCurrentUser();

  if (searchParams.has('section')) {
    return <Navigate to={legacySectionPath(searchParams.get('section')) ?? '/admin'} replace />;
  }

  if (role === undefined) {
    return null;
  }

  const [dashboardSection, ...otherSections] = ADMIN_SECTIONS;
  if (!can(dashboardSection.policy)) {
    const firstAllowed = otherSections.find((section) => can(section.policy));
    return firstAllowed ? <Navigate to={firstAllowed.path} replace /> : <AdminForbiddenPage />;
  }

  return <AdminSectionRoute policy={dashboardSection.policy}>{dashboard}</AdminSectionRoute>;
};
