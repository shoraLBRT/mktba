import { AdminRoutes } from '../app/AdminRoutes';
import { loadLocaleChunk } from '../localization';
// The admin is Russian only (A-06, #35): its strings come with it (`localization/defaultLanguage.ts`).
import '../localization/defaultLanguage';

// Client-only: the server sends the empty fallback, the browser loads the admin's strings (a lazy
// dictionary chunk, #106), renders the admin and restores the session.
export const clientLoader = async () => {
  await loadLocaleChunk('admin');
  return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return null;
}

export default function AdminRoute() {
  return <AdminRoutes />;
}
