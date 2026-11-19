import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useMatches,
  useNavigate,
  useRouteLoaderData,
  type LinksFunction,
  type LoaderFunctionArgs,
} from 'react-router';
import interCyrillic400Url from '@fontsource/inter/files/inter-cyrillic-400-normal.woff2?url';
import './index.css';
import { CookieConsent } from './components/CookieConsent';
import { PageMeta } from './components/PageMeta';
import { ErrorFallback } from './components/ErrorFallback';
import { MazhabProvider } from './context/MazhabProvider';
import { useLocale } from './localization/hooks';
import { LocalizationProvider } from './localization/provider';
import { ADMIN_SESSION_EXPIRED_EVENT, useSession } from './services/session';
import { createQueryClient, invalidateArticleQueries } from './app/queryClient';
import type { RouteHandle } from './app/routeHandle';
import { SiteUrlContext } from './app/siteUrl';
import { resolveSiteUrl } from './server/siteUrl.server';
import {
  APPLE_TOUCH_ICON_PATH,
  FAVICON_ICO_PATH,
  FAVICON_SVG_PATH,
  THEME_COLOR,
  WEB_MANIFEST_PATH,
} from './shared/siteIcons';

type RootData = {
  /** Public site address for canonical links and Open Graph URLs (`PUBLIC_SITE_URL`). */
  siteUrl: string;
};

/** On the server, once per document: the address absolute page URLs are built on. */
export const loader = ({ request }: LoaderFunctionArgs): RootData => ({ siteUrl: resolveSiteUrl(request) });

/**
 * The body text font (Inter, regular, Cyrillic) is fetched with the HTML instead of after the CSS
 * is parsed, so the swap from the fallback font happens before the first paint more often.
 */
export const links: LinksFunction = () => [
  { rel: 'preload', href: interCyrillic400Url, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
];

/** The site address does not change while the page is open; navigation never refetches it. */
export const shouldRevalidate = () => false;

/** The HTML document around every page (error pages included), rendered on the server. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href={FAVICON_ICO_PATH} sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href={FAVICON_SVG_PATH} />
        <link rel="apple-touch-icon" href={APPLE_TOUCH_ICON_PATH} />
        <link rel="manifest" href={WEB_MANIFEST_PATH} />
        <meta name="theme-color" content={THEME_COLOR} />
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

/** Generic, non-indexed metadata (admin, sign-in, service pages), unless the matched page renders its own. */
const FallbackPageMeta = () => {
  const ownsMeta = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.ownsMeta);
  return ownsMeta ? null : <PageMeta noIndex noFollow />;
};

export default function App() {
  // One client per server render and one for the browser's lifetime.
  const [queryClient] = useState(createQueryClient);
  const { siteUrl } = useLoaderData<typeof loader>();

  return (
    <SiteUrlContext.Provider value={siteUrl}>
      <LocalizationProvider>
        <QueryClientProvider client={queryClient}>
          <MazhabProvider>
            <FallbackPageMeta />
            <AdminSessionExpirationHandler />
            <SessionQueryRefresh />
            <CookieConsent />
            <Outlet />
          </MazhabProvider>
        </QueryClientProvider>
      </LocalizationProvider>
    </SiteUrlContext.Provider>
  );
}

/** A loader that failed or a page that threw while rendering. */
export function ErrorBoundary() {
  const siteUrl = useRouteLoaderData<typeof loader>('root')?.siteUrl ?? null;

  return (
    <SiteUrlContext.Provider value={siteUrl}>
      <LocalizationProvider>
        <ErrorPageMeta />
        <ErrorFallback />
      </LocalizationProvider>
    </SiteUrlContext.Provider>
  );
}

/** The error page's metadata: its own title, not indexed. */
const ErrorPageMeta = () => <PageMeta title={useLocale().errorPage.title} description={null} noIndex />;
