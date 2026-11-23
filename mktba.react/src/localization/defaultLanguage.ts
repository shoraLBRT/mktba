import { addLanguageCore } from './loader';
import { DEFAULT_LOCALE } from './validation';

/**
 * The Russian `core` strings, imported for their effect by the route modules only Russian pages
 * match (`routes/russian.tsx`: the Russian reader's pages, the sign-in, the old URLs;
 * `routes/admin.tsx`; `routes/not-found.tsx`). React Router preloads a page's route modules with
 * their imports in the server HTML and evaluates them before the client entry, so a Russian page has
 * its strings before hydration with no request of its own, and an English page never downloads them
 * (I-02, #106). Anything else that needs them (a navigation from `/en/` into `/`) loads them with
 * `loadLanguage`.
 */
addLanguageCore(
  DEFAULT_LOCALE,
  Object.entries(
    import.meta.glob<{ default: Record<string, unknown> }>('./locales/ru/*.json', {
      eager: true,
      query: '?locale-chunk=core',
    }),
  ),
);
