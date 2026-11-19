import AdminLoginPage from '../pages/AdminLoginPage';

// Client-only like the rest of the admin: the form appears once it works, so nothing typed or
// clicked before hydration is lost, and the server never deals with credentials.
export const clientLoader = () => null;
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return null;
}

export default function AdminLoginRoute() {
  return <AdminLoginPage />;
}
