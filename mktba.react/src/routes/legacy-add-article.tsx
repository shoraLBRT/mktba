import { redirect } from 'react-router';
import { APP_CONSTANTS } from '../constants/AppConstants';

/** The old create path; the page itself is in the admin now. */
export const loader = () => redirect(APP_CONSTANTS.ROUTES.ADD_ARTICLE);
export const clientLoader = loader;

export default function LegacyAddArticleRoute() {
  return null;
}
