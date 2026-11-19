import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import { SiteStructuredData } from '../components/StructuredData';
import WelcomePage from '../pages/WelcomePage';

export const handle: RouteHandle = { ownsMeta: true };

/** The home page: the site's own title, description, default social image and structured data. */
export default function HomeRoute() {
  return (
    <>
      <PageMeta path="/" />
      <SiteStructuredData />
      <WelcomePage />
    </>
  );
}
