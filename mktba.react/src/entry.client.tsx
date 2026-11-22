import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { getConsent, initMetrika } from './analytics/metrika';
import { startWebVitals } from './analytics/events';
import { installClientErrorReporting } from './services/clientErrors';
import { startSession } from './services/session';

// Browser-only startup, before the server's HTML is hydrated.
installClientErrorReporting();
if (getConsent() === true) {
  initMetrika();
}

void startSession();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});

// Web Vitals (N-11, #153): a lazy chunk, fetched after hydration has started and only with consent.
startWebVitals();
