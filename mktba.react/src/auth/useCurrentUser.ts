import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { getCurrentUser } from '../services/authService';
import { getStoredAdminToken } from '../services/authTokenStorage';
import { roleAllows, type RolePolicy } from './roleAccess';

/**
 * The signed-in user and their role, or undefined while loading or when signed out. Keyed by the
 * token, so signing in as someone else never shows the previous user's role.
 */
export const useCurrentUser = () => {
  const token = getStoredAdminToken();
  const query = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.CURRENT_USER, token],
    queryFn: getCurrentUser,
    enabled: token !== null,
  });
  const role = query.data?.role;

  return {
    user: query.data,
    role,
    can: (policy: RolePolicy) => roleAllows(role, policy),
  };
};
