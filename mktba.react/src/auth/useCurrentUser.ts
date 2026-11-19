import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { getCurrentUser } from '../services/authService';
import { useSession } from '../services/session';
import { roleAllows, type RolePolicy } from './roleAccess';

/**
 * The signed-in user and their role, or undefined while loading or when signed out. Keyed by the
 * signed-in email, so signing in as someone else never shows the previous user's role, while the
 * access token renewing every few minutes does not refetch it.
 */
export const useCurrentUser = () => {
  const { accessToken, email } = useSession();
  const query = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.CURRENT_USER, email],
    queryFn: getCurrentUser,
    enabled: accessToken !== null,
  });
  const role = accessToken === null ? undefined : query.data?.role;

  return {
    user: accessToken === null ? undefined : query.data,
    role,
    can: (policy: RolePolicy) => roleAllows(role, policy),
  };
};
