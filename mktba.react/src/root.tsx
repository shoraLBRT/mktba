import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useMatches, useNavigate } from 'react-router';
import './index.css';
import { CookieConsent } from './components/CookieConsent';
import { DefaultDocumentTitle } from './components/DefaultDocumentTitle';
import { ErrorFallback } from './components/ErrorFallback';
import { MazhabProvider } from './context/MazhabProvider';
import { LocalizationProvider } from './localization/provider';
import { ADMIN_SESSION_EXPIRED_EVENT, useSession } from './services/session';
import { createQueryClient, invalidateArticleQueries } from './app/queryClient';
import type { RouteHandle } from './app/routeHandle';

/** The HTML document around every page, rendered on the server. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const AdminSessionExpirationHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      navigate('/admin/login', { replace: true });
    };

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [navigate]);

  return null;
};

/**
 * The server renders every page anonymously. When this browser's session is restored (or the user
 * signs in or out), the article data is refetched with the new rights, so drafts show up for editors.
 */
const SessionQueryRefresh = () => {
  const queryClient = useQueryClient();
  const signedIn = useSession().accessToken !== null;
  const previous = useRef(signedIn);

  useEffect(() => {
    if (previous.current !== signedIn) {
      previous.current = signedIn;
      void invalidateArticleQueries(queryClient);
    }
  }, [signedIn, queryClient]);

  return null;
};

/** The default `<title>`, unless the matched page renders its own. */
const DocumentTitle = () => {
  const ownsTitle = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.ownsTitle);
  return ownsTitle ? null : <DefaultDocumentTitle />;
};

export default function App() {
  // One client per server render and one for the browser's lifetime.
  const [queryClient] = useState(createQueryClient);

  return (
    <LocalizationProvider>
      <QueryClientProvider client={queryClient}>
        <MazhabProvider>
          <DocumentTitle />
          <AdminSessionExpirationHandler />
          <SessionQueryRefresh />
          <CookieConsent />
          <Outlet />
        </MazhabProvider>
      </QueryClientProvider>
    </LocalizationProvider>
  );
}

/** A loader that failed or a page that threw while rendering. */
export function ErrorBoundary() {
  return (
    <LocalizationProvider>
      <DefaultDocumentTitle />
      <ErrorFallback />
    </LocalizationProvider>
  );
}
