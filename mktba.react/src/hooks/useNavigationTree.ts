import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { getNavigationTree } from '../services/Article/navigationService';

/** The article hierarchy, shared by the sidebar, breadcrumbs and the admin parent pickers. */
export const useNavigationTree = () =>
  useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE],
    queryFn: getNavigationTree,
  });
