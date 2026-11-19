import { AdminRoutes } from '../app/AdminRoutes';

// Client-only: the server sends the empty fallback, the browser renders the admin and restores the session.
export const clientLoader = () => null;
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return null;
}

export default function AdminRoute() {
  return <AdminRoutes />;
}
