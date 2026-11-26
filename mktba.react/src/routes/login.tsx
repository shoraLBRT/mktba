import type { RouteHandle } from '../app/routeHandle';
import { PageMeta } from '../components/PageMeta';
import { loadLocaleChunk } from '../localization';
import { useLocale } from '../localization/hooks';
import ReaderLoginPage from '../pages/account/ReaderLoginPage';

export const handle: RouteHandle = { ownsMeta: true };

// The readers' sign-in (U-05, #126). Client-only like the admin: the form appears once it
// works, the server never deals with credentials or tokens, and the strings come with the admin's
// chunk (Russian only), which the reader needs next anyway. Not for search engines, from the server
// HTML on (the fallback's meta).
export const clientLoader = async () => {
  await loadLocaleChunk('admin');
  return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <PageMeta description={null} image={null} noIndex />;
}

export default function ReaderLoginPageRoute() {
  const t = useLocale().account;

  return (
    <>
      <PageMeta title={t.login.title} description={null} image={null} noIndex />
      <ReaderLoginPage />
    </>
  );
}
