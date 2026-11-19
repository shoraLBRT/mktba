import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { getConsent, initMetrika } from './analytics/metrika';
import { startSession } from './services/session';

// Browser-only startup, before the server's HTML is hydrated.
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
