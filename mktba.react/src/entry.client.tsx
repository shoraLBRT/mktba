import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { getConsent, initMetrika } from './analytics/metrika';
import { startWebVitals } from './analytics/events';
import { installClientErrorReporting } from './services/clientErrors';
import { startSession } from './services/session';
import { isLanguageLoaded, loadLanguage } from './localization';
import { languageFromPath } from './localization/language';

// Browser-only startup, before the server's HTML is hydrated.
installClientErrorReporting();
if (getConsent() === true) {
  initMetrika();
}

void startSession();

const hydrate = () =>
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });

// The server rendered the page in its language: hydrate with the same strings. The default language
// is in the bundle; another one is a lazy chunk (I-05, #109), fetched first.
const language = languageFromPath(window.location.pathname);
if (isLanguageLoaded(language)) {
  hydrate();
} else {
  void loadLanguage(language).then(hydrate, hydrate);
}

// Web Vitals (N-11, #153): a lazy chunk, fetched after hydration has started and only with consent.
startWebVitals();
