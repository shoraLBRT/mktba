import { useQuery } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../constants/AppConstants';
import type { Language } from '../localization/language';
import { getNavigationTree } from '../services/Article/navigationService';

/** The query key of the tree in a language, or of the tree of every language (`'all'`). */
export const navigationTreeQueryKey = (language?: Language) =>
  [APP_CONSTANTS.QUERY_KEYS.NAVIGATION_TREE, language ?? 'all'] as const;

/**
 * The article hierarchy. The reader's pages (sidebar, breadcrumbs, home sections) pass the page's
 * language and get only its articles (I-06, #110); the admin's tree and parent pickers pass none and
 * get every language.
 */
export const useNavigationTree = (language?: Language) =>
  useQuery({
    queryKey: navigationTreeQueryKey(language),
    queryFn: () => getNavigationTree(language),
  });
