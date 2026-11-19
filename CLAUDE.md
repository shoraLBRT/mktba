# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is mktba

**mktba** — open-source исламская wiki-платформа, hard fork WikiWeaver. Контент организован как иерархическое дерево статей, каждая содержит параграфы, а каждый параграф — одно или несколько «мнений» (Opinion), привязанных к одной или нескольким школам исламского права (мазхабам). Поддерживаются 4 канонические суннитские школы (Hanafi, Maliki, Shafi'i, Hanbali) плюс произвольные кастомные школы per-article. Админ-панель (`/admin`, доступна только по прямому URL) управляет всем контентом.

UI — только на русском. Целевой домен — `mktba.ru`.

## Commands

### Backend (run from repo root)
```bash
docker compose up -d postgres
dotnet build Mktba.sln            # plain `dotnet build` fails with MSB1011 (docker-compose.dcproj)
dotnet test Mktba.sln
dotnet run --project Mktba.Api    # :5172, Development: connects to the compose `postgres` DB out of the box
```
Machine-specific settings go in the gitignored `Mktba.Api/appsettings.local.json` (template: `appsettings.local.example.json`); it overrides `appsettings.{Environment}.json`, while user secrets and env vars override it.

### Frontend (run from `mktba.react/`)
```bash
npm install
npm run dev       # react-router dev (Vite + SSR) on :5173
npm run build     # tsc -b && react-router build → build/client, build/server
npm run size      # after build: JS budget of the /article/:slug first load (scripts/check-bundle-size.mjs)
npm run lint      # eslint
npm test          # vitest run (unit + Testing Library, jsdom)
npm start         # react-router-serve the production build (PORT, API_INTERNAL_URL, PUBLIC_SITE_URL)
npm test          # Vitest, once (as in CI)
npm run test:e2e  # Playwright against a throwaway DB, see README
npm run gen:api   # regenerate the OpenAPI contract after endpoint/DTO changes
```

## Architecture

Clean DDD layering — each layer depends only on layers below it:

```
Mktba.Domain          → pure entities, no external dependencies
Mktba.Application     → services, DTOs, AutoMapper profiles
Mktba.Infrastructure  → EF Core (PostgreSQL), repositories, Unit of Work, seeders
Mktba.Api      → ASP.NET Core 8 Minimal API, JWT auth, CORS, Swagger
mktba.react           → React 19 + TypeScript, React Router v7 framework mode (SSR), React Query v5, Tailwind CSS v4, Vite
```

**Key domain concepts:**
- `Article` contains ordered `Paragraph`s (slot).
- `Article.Slug` — URL segment (`/article/{slug}`), transliterated from the title or set by hand; unique per `Locale` together with old slugs (index `(Locale, Slug)` on both tables). A changed slug leaves an `ArticleSlugRedirect` (carrying the article's locale); old `/article/{id}` links redirect to the slug URL. Transliteration lives in `ArticleSlugRules` (C#), the `AddArticleSlugs` migration backfill (SQL) and `src/shared/slug.ts` (editor prefill) — keep the three identical.
- `Article.Locale` / `TranslationGroupId` (M-09, #27) — D6: a translation is a separate article per language. `Locale` is a short code from `Locales.Supported` (`Mktba.Domain/Entities/Locales.cs`, the one list; default `ru`, anything else → `locale_unsupported`), set on create and never changed. Articles sharing a `TranslationGroupId` are translations of each other, at most one per locale (unique index); a new article starts its own group. `GET /articles/by-slug/{slug}/content?locale=` defaults to `ru`. Revision snapshots do not carry the locale (it cannot change). School names: `School.Name`/`ShortName` are Russian, other languages live in `SchoolTranslation(SchoolId, Locale, Name, ShortName)` (system schools seeded with `en`; not exposed in the API yet, I-07 #111). Tags are a per-article string list, so they are already per language. English UI/routes are Stage 5 (epic 9).
- Each `Paragraph` holds one or more `Opinion`s; one `Opinion` is marked default (fallback when user's mazhab has no specific opinion).
- `Opinion` ↔ `School` is M:N through `OpinionSchool` join.
- A plain paragraph (exactly one `Opinion`) is common to all schools and has no school links: every write path (`/paragraph`, `/articles/content`, `/articles/{id}/content`) rejects school ids on it with `paragraph_plain_schools_not_allowed`, and the editor offers school selection only in a block with two or more opinions (a block left with one non-empty opinion is saved as a plain paragraph, without school ids). School links belong to versioned paragraphs (two or more opinions).
- `School` — 4 канонические (`IsSystem=true`) + кастомные per-article (`ArticleScopeId` nullable FK).
- `Article.Status` (`ArticleStatus`): `Draft → InReview → Published → Archived`. Allowed moves live only in `ArticleStatusTransitions` (Draft→InReview, InReview→Published/Draft, Published→Archived, Archived→Draft), changed via admin-only `POST /articles/{id}/status`. New articles are `Draft`.
- Anonymous readers see only `Published` (`ArticleVisibility`): non-Published articles answer 404, related links to them are dropped, and the public tree hides a non-Published article together with its subtree. Admins see every status (badge in the tree, status panel in the editor).
- `Article` dates and authorship (M-03): `CreatedAt`, `UpdatedAt` (any content/metadata/authorship save; not status changes), `PublishedAt` (first move to Published; kept through archiving and re-publishing) — UTC, set through the injected `TimeProvider`. `AuthorId` = creating user (nullable, SetNull on user delete); co-authors via `ArticleCoAuthor` (ArticleId, UserId), never the author; admin API `GET/PUT /articles/{id}/authors`, users list `GET /users`. Readers see only the dates: users have no display name yet, and emails stay admin-only.
- `ArticleRevision` (M-04): append-only history. Every save through `POST /articles/content` / `PUT /articles/{id}/content` writes, in the same transaction, revision N+1 (`Number` per article, `AuthorId`, optional `Comment` from the DTO's write-only `editComment`, `Snapshot` = jsonb of `ArticleSnapshotDto` — `schemaVersion` 2, self-contained: title/slug/summary/tags/infobox/paragraphs/opinions/school ids/related links with title+slug at save time, SEO fields; version 1 has no `seo` and stays readable — restoring it clears the SEO overrides). The current tables stay the working copy. Revisions are never updated or deleted; rollback (`POST /articles/{id}/revisions/{n}/restore`) saves the old snapshot as a new revision. Admin API: `GET /articles/{id}/revisions`, `/revisions/{n}`, `/revisions/compare?from=&to=`; diff is rendered client-side (`pages/article-history/revisionDiff.ts`), UI at `/admin/articles/{id}/history`. The `AddArticleRevisions` migration backfills revision 1 for existing articles in SQL — keep its JSON shape in step with `ArticleSnapshotDto`. `Article.PublishedRevisionId` is set to the latest revision on every move to Published: the hook for D4 (#20), readers are still served the working copy. Paragraph endpoints, `POST/PUT /articles` metadata and authorship changes do not write revisions.
- Article SEO fields (M-10, #28): `SeoTitle` (≤ 70), `SeoDescription` (≤ 160), `SocialImageUrl` (absolute http(s) URL or site-relative `/path`, ≤ 2048; no upload), `NoIndex` — written as `seo` on the content DTOs (full replace like the other fields: `seo: null` clears them), validated in `ArticleSeo` (codes `article_seo_title_too_long`, `article_seo_description_too_long`, `article_social_image_url_invalid`; client mirror `src/shared/seo.ts`). Read-only `meta` on `ArticleContentDto` carries the effective values: title = SeoTitle ?? Title; description = SeoDescription ?? Summary ?? plain text of the first paragraph's default opinion cut to 160 chars on a word boundary (null if none). The article page renders `<title>`, description, Open Graph, canonical (`/article/{slug}`) and robots noindex through React 19 document metadata (`components/article/ArticleMeta.tsx`) — a client-side stopgap until SSR (O-01 #52, O-04 #55).
- `NavigationTree` exposes the article hierarchy for the sidebar.
- `User` (ex-`AdminUser`) authenticates via JWT; `Role` is `Reader`/`Author`/`Scholar`/`Admin` (stored by name, read from the DB on every request). Endpoints name a policy from `Mktba.Api/Infrastructure/Policies.cs`, never a role; `EndpointAuthorizationMatrixTests` lists every endpoint's policy. The first user is `Admin`; everyone else registers with an `Invite` (U-04 #32): a DB row with the SHA-256 hash of a random token (raw token shown once), a `Role`, `ExpiresAtUtc` (default `Auth:InviteTokenLifetimeHours`, max 720 h), optional `Note`, single-use — `UsedAtUtc`/`RevokedAtUtc` are EF concurrency tokens, so the use is a conditional update in the same SaveChanges as the new user and a racing second use fails with `invite_used`. Admins change roles via `PUT /users/{id}/role`; the last admin cannot be demoted (`last_admin_demotion`). Per-object rights for authors: U-02 #30. Frontend mirror: `src/auth/roleAccess.ts`, `useCurrentUser` (`GET /auth/me`).

**API surface** (all in `Mktba.Api/Endpoints/`):
- `/auth` — `GET /status`, `POST /register` (first admin, then only with an invite token; the user gets the invite's role), `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `GET /sessions`, `DELETE /sessions/{id}`, `GET /me`
- `/invites` — `GET /`, `POST /` (role, lifetime, note → token once), `POST /{id}/revoke` (Admin only)
- `/users` — `GET /` (with roles), `PUT /{id}/role` (Admin only)
- `/navigationTree/tree` — article hierarchy for the sidebar
- `/articles` — article CRUD (`GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`)
- `/articles/{id}/content`, `POST /articles/content` — article with its paragraphs and opinions, read and saved as a whole
- `/articles/by-slug/{slug}/content` — the same content by slug; an old slug answers 302 to the current slug's URL
- `/articles/recent?locale=&limit=` — the home page's lists (R-05, #41): `new` by `PublishedAt`, `updated` = saved after publication, by `UpdatedAt`; public, the same for every caller: Published, every ancestor Published, no empty stubs (`RecentArticlesService`)
- `/paragraph` — paragraph CRUD (`GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`)
- `/schools` — `GET /system`, `GET /article/{articleId}`, `POST /`, `DELETE /{id}`
- `/admin` — `POST /cleanup`, `GET|PUT|DELETE /ai-settings`, `POST /ai-style`, `POST /ai-check`

**Frontend rendering (O-01, decision D1):**
- React Router v7 framework mode, `appDirectory: 'src'`: `src/root.tsx` (document, providers), `src/routes.ts` (route config), `src/routes/*` (route modules), `src/entry.client.tsx` (browser startup: session restore, Metrika).
- Public routes have a server `loader` that fetches the API anonymously (`src/server/api.server.ts`, base `API_INTERNAL_URL`) into a server QueryClient and returns `dehydrate()`d state; the route component wraps the page in `HydrationBoundary`. A `clientLoader` skips the server on later client-side navigations (pages fetch through React Query as before). Loaders set status codes (`data(..., { status: 404 })`, `redirect(..., 301)`).
- `/admin/*` is client-only (`clientLoader.hydrate` + `HydrateFallback`); auth never runs on the server.
- Home page (R-05, #41): `src/pages/HomePage.tsx` — sections (top level of the navigation tree the public layout already loaded), new and updated articles (`GET /articles/recent`, prefetched by the home route's loader), the «что такое mktba» text, and a search box that only matches article titles in the navigation tree (`src/pages/home/homeTree.ts`). Not there yet: full-text search (R-10, #46) and popular articles (needs view statistics, analytics epic).
- No `localStorage`/`window` during render: read stored values after hydration via `useHydrated()`; `useSession` renders anonymously on the server and while hydrating.
- Article header (R-06, #42): `ArticleBreadcrumbs` (home → ancestors from the public navigation tree via `findArticlePath` in `src/shared/articleTree.ts` → the article; shown for stubs and for an article the tree does not hold; the public tree already hides non-Published ancestors), the h1, then `ArticleDates` with the dates and the reading time. The reading time is computed on the client (`src/shared/readingTime.ts`, 180 words a minute) from each paragraph's default opinion, so the server HTML and the hydrated page agree whatever the reader's mazhab; a stub has none. No author line (P-06 #94) and no verification widget (V-04 #120) yet.
- Article anchors and table of contents (R-07, #43): `buildArticleOutline` (`src/shared/articleOutline.ts`) is the one source of the ids — a paragraph is `p-{paragraph id}` (stable through edits and reordering), a heading is its transliterated text (`slugFromTitle`; repeats get `-2`, `-3` in reading order; `section` when nothing transliterates), never an id already taken on the page. Headings are parsed with the renderer's own syntax (`src/shared/markdownHeadings.ts`, which also holds the h2-nesting rule) and `MarkdownContent` puts the ids on them through `headingAnchors`. Only the opinion on screen gets heading ids (hidden panels have none), so the server HTML carries the default opinions' anchors and the reader's mazhab may change them after hydration; `useHashAnchor` re-aligns the page to the URL's `#anchor` then (also for `?mazhab=…#anchor` links and late fonts) until the reader touches the page. The right sidebar lists h2/h3 and highlights the current one (`useActiveSection`); it is hidden below `xl` (mobile: R-11 #47). `BackToTopButton` is client-only.
- Article footer (R-08, #44): `ArticleFooter` under the text, inside the article column — «В этом разделе» (the article's direct children in the public navigation tree; a stub is listed without a link, as in the tree and the breadcrumbs), «Связанные статьи» (`relatedLinks` of the content DTO; hidden from `xl` up, where the right sidebar already shows them) and previous / next (`findAdjacentArticles` in `src/shared/articleTree.ts`: the tree read top to bottom — a parent, its children, then the next sibling — stepping over stubs). Everything comes from data the page already has (the public tree hides non-Published articles, the API drops related links to them), so it is in the server HTML. A block with nothing to show is left out. The block headings are `h2` but are deliberately not in the table of contents: it lists the article's content, not its navigation. Not there yet: sources (no model: M-07 #71, E-09 #145) and «сообщить об ошибке» (feedback epic: F-01 #66, F-02 #67, F-03 #68).
- Document metadata (O-04): `PageMeta` (`src/components/PageMeta.tsx`) renders title ("{page} — mktba"), description, canonical, robots, Open Graph and Twitter Card as React 19 elements hoisted into `<head>` (in the server HTML too); rules live in `src/shared/siteMeta.ts`. Exactly one `PageMeta` is mounted at a time: a route with `handle.ownsMeta` renders its own (home, article, 404), otherwise the root renders a generic `noindex, nofollow` one (admin, sign-in, service pages). Absolute URLs are built on the root loader's `siteUrl` (`PUBLIC_SITE_URL`, else the request origin) via `useSiteUrl()`; the article canonical path comes from `articleHref`.
- Infobox layout (R-04): `ArticleInfoboxPanel` floats right by the width of its nearest `@container` ancestor (`@2xl`, the article column), not the viewport; whatever renders it must provide that `@container flow-root` wrapper. A bordered or filled block that can sit next to it needs `flow-root` so it ends at the float instead of running under it. Below `sm` the body is collapsed with CSS only (it stays in the server HTML).

**Frontend ↔ Backend:**
- Base URL configured in `mktba.react/src/config.ts` (`http://localhost:5172`)
- CORS allows any loopback / `localhost` origin (Vite dev port `:5173`)
- Access token (15 min) kept in memory only (`src/services/session.ts`); the refresh token is an `httpOnly` cookie (`mktba_refresh`, `Path=/auth`) rotated by `POST /auth/refresh`, which the axios interceptor calls once on a 401 and the app calls on load. Access tokens carry the session id (`mktba_sid`) and `JwtProblemEvents.TokenValidated` rejects them once the session is revoked (README «Сессии»). Protected routes under `/admin/*`
- HTTP via Axios; server state via React Query
- Global mazhab selection stored in `localStorage['mktba.mazhab']`, exposed through `MazhabContext`; the picker (`components/mazhab/MazhabSelector.tsx`) sits in the public header and shows a one-time hint (`localStorage['mktba.mazhabHintSeen']`). A shared link `?mazhab=<system school slug>` (R-03, #39) wins over the saved choice while the parameter is in the URL and never overwrites it; choosing by hand saves the choice and drops the parameter. The canonical schools are prefetched by the public layout's loader (`routes/public-layout.tsx`), not by pages: a query a component above a page's `HydrationBoundary` already observes gets that boundary's data only in an effect, too late for the server HTML — for the same reason `MazhabProvider` (above the layout) resolves the link slug through a query key of its own

**Database:** PostgreSQL 16. Connection string `ConnectionStrings:DefaultConnection`; Development uses `appsettings.Development.json`, matching `docker-compose.yml` (service `postgres`).

## Coding conventions

- English for all code symbols; Russian may appear in UI strings/comments/AI prompts.
- UI text lives only in `mktba.react/src/localization/locales/ru/*.json`; ESLint (`i18next/no-literal-string`) fails on hard-coded JSX text and user-facing attribute strings in `src/**/*.tsx`.
- No dead code, no commented-out blocks, no TODOs without an issue reference.
- No unrelated refactors mixed into task-specific changes.
- Keep public API/DTO contracts documented.
- API errors are `application/problem+json` bodies (`ApiProblemDetails`: `title`, `status`, `code`, optional `params`, `traceId`). Add a new error to `Mktba.Application/Exceptions/AppErrors.cs` (stable snake_case code) and its Russian text to `apiErrors` in `mktba.react/src/localization/locales/ru/shared.json`; the UI shows only the translation by code, never the server's `title`.

## Commits

Use Conventional Commits:
```
feat:      new functionality
fix:       bug fixes
refactor:  internal restructuring without behavior change
test:      tests only
docs:      documentation only
chore:     maintenance/tooling
style:     formatting, no logic changes
```
Scope is optional: `fix(api): validate node parent before update`

## Testing

- Unit tests for domain logic; integration tests for DB/API boundaries.
- Prefer real behavior over mocks. Assert observable outcomes.
- Test names: describe scenario + expected result (Given/When/Then structure).
- Cover happy path, at least one edge case, and one failure path per behavior change.
- For bug fixes, add a regression test.

## Roadmap

Backlog, order of work and review findings — [docs/backlog.md](docs/backlog.md) (section 6 is the order of work); tasks live in GitHub Issues. Discrepancy checklist (Figma ↔ current UI) — [docs/figma-checklist.md](docs/figma-checklist.md).
