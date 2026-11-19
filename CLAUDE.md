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
npm run dev       # dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # eslint
npm test          # vitest run (unit + Testing Library, jsdom)
npm run preview   # preview production build
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
mktba.react           → React 19 + TypeScript, React Router v7, React Query v5, Tailwind CSS v4, Vite
```

**Key domain concepts:**
- `Article` contains ordered `Paragraph`s (slot).
- `Article.Slug` — URL segment (`/article/{slug}`), transliterated from the title or set by hand; unique across articles until M-09 (#27) makes it unique per locale. A changed slug leaves an `ArticleSlugRedirect`; old `/article/{id}` links redirect to the slug URL. Transliteration lives in `ArticleSlugRules` (C#), the `AddArticleSlugs` migration backfill (SQL) and `src/shared/slug.ts` (editor prefill) — keep the three identical.
- Each `Paragraph` holds one or more `Opinion`s; one `Opinion` is marked default (fallback when user's mazhab has no specific opinion).
- `Opinion` ↔ `School` is M:N through `OpinionSchool` join.
- A plain paragraph (exactly one `Opinion`) is common to all schools and has no school links: every write path (`/paragraph`, `/articles/content`, `/articles/{id}/content`) rejects school ids on it with `paragraph_plain_schools_not_allowed`, and the editor offers school selection only in a block with two or more opinions (a block left with one non-empty opinion is saved as a plain paragraph, without school ids). School links belong to versioned paragraphs (two or more opinions).
- `School` — 4 канонические (`IsSystem=true`) + кастомные per-article (`ArticleScopeId` nullable FK).
- `Article.Status` (`ArticleStatus`): `Draft → InReview → Published → Archived`. Allowed moves live only in `ArticleStatusTransitions` (Draft→InReview, InReview→Published/Draft, Published→Archived, Archived→Draft), changed via admin-only `POST /articles/{id}/status`. New articles are `Draft`.
- Anonymous readers see only `Published` (`ArticleVisibility`): non-Published articles answer 404, related links to them are dropped, and the public tree hides a non-Published article together with its subtree. Admins see every status (badge in the tree, status panel in the editor).
- `Article` dates and authorship (M-03): `CreatedAt`, `UpdatedAt` (any content/metadata/authorship save; not status changes), `PublishedAt` (first move to Published; kept through archiving and re-publishing) — UTC, set through the injected `TimeProvider`. `AuthorId` = creating user (nullable, SetNull on user delete); co-authors via `ArticleCoAuthor` (ArticleId, UserId), never the author; admin API `GET/PUT /articles/{id}/authors`, users list `GET /users`. Readers see only the dates: users have no display name yet, and emails stay admin-only.
- `NavigationTree` exposes the article hierarchy for the sidebar.
- `User` (ex-`AdminUser`) authenticates via JWT; `Role` currently always `Admin`; invite tokens bootstrap new admins.

**API surface** (all in `Mktba.Api/Endpoints/`):
- `/auth` — `GET /status`, `POST /register` (first admin, then only with an invite token), `POST /login`, `POST /invite-token`
- `/navigationTree/tree` — article hierarchy for the sidebar
- `/articles` — article CRUD (`GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`)
- `/articles/{id}/content`, `POST /articles/content` — article with its paragraphs and opinions, read and saved as a whole
- `/articles/by-slug/{slug}/content` — the same content by slug; an old slug answers 302 to the current slug's URL
- `/paragraph` — paragraph CRUD (`GET /`, `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`)
- `/schools` — `GET /system`, `GET /article/{articleId}`, `POST /`, `DELETE /{id}`
- `/admin` — `POST /cleanup`, `GET|PUT|DELETE /ai-settings`, `POST /ai-style`, `POST /ai-check`

**Frontend ↔ Backend:**
- Base URL configured in `mktba.react/src/config.ts` (`http://localhost:5172`)
- CORS allows any loopback / `localhost` origin (Vite dev port `:5173`)
- Auth token stored in `localStorage`; protected routes under `/admin/*`
- HTTP via Axios; server state via React Query
- Global mazhab selection stored in `localStorage['mktba.mazhab']`, exposed through `MazhabContext`

**Database:** PostgreSQL 16. Connection string `ConnectionStrings:DefaultConnection`; Development uses `appsettings.Development.json`, matching `docker-compose.yml` (service `postgres`).

## Coding conventions

- English for all code symbols; Russian may appear in UI strings/comments/AI prompts.
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
