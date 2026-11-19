import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import WelcomePage from '../pages/WelcomePage';

export const handle: RouteHandle = { ownsMeta: true };

/** The home page: the site's own title, description and default social image. */
export default function HomeRoute() {
  return (
    <>
      <PageMeta path="/" />
      <WelcomePage />
    </>
  );
}
