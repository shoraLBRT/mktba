import { data } from 'react-router';
import type { RouteHandle } from '../app/routeHandle';
import { NotFoundMeta } from '../components/PageMeta';
import NotFoundPage from '../pages/NotFoundPage';
// A 404 is mostly at a Russian URL, so its strings come with it (I-02, #106): an English 404 loads
// them too. See `localization/defaultLanguage.ts`.
import '../localization/defaultLanguage';

export const handle: RouteHandle = { ownsMeta: true };

/** Any URL no other route takes: the 404 page, with a 404 status from the server. */
export const loader = () => data(null, { status: 404 });
export const clientLoader = () => null;

export default function NotFoundRoute() {
  return (
    <>
      <NotFoundMeta />
      <NotFoundPage />
    </>
  );
}
