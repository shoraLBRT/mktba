import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import { useLocale } from '../localization/hooks';
import FeedbackPage from '../pages/FeedbackPage';

export const handle: RouteHandle = { ownsMeta: true };

/**
 * The feedback form (F-01, #66). A page of its own, not a dialog: it has an address to link to, is
 * in the server HTML, and its code stays out of the article page's first load. Not for search
 * engines: `noindex`, no canonical.
 */
export default function FeedbackRoute() {
  const t = useLocale().feedbackPage;

  return (
    <>
      <PageMeta title={t.title} description={t.intro} image={null} noIndex />
      <FeedbackPage />
    </>
  );
}
