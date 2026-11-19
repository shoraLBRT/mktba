import { data } from 'react-router';
import NotFoundPage from '../pages/NotFoundPage';

/** Any URL no other route takes: the 404 page, with a 404 status from the server. */
export const loader = () => data(null, { status: 404 });
export const clientLoader = () => null;

export default function NotFoundRoute() {
  return <NotFoundPage />;
}
