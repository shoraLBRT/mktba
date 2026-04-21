# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is mktba

**mktba** — open-source исламская wiki-платформа, hard fork WikiWeaver. Контент организован как иерархическое дерево статей, каждая содержит параграфы, а каждый параграф — одно или несколько «мнений» (Opinion), привязанных к одной или нескольким школам исламского права (мазхабам). Поддерживаются 4 канонические суннитские школы (Hanafi, Maliki, Shafi'i, Hanbali) плюс произвольные кастомные школы per-article. Админ-панель (`/admin`, доступна только по прямому URL) управляет всем контентом.

UI — только на русском. Целевой домен — `mktba.ru`.

## Commands

### Backend (run from repo root)
```bash
docker compose up -d postgres
dotnet restore
dotnet build
dotnet run --project Mktba.Api
```

### Frontend (run from `mktba.react/`)
```bash
npm install
npm run dev       # dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # eslint
npm run preview   # preview production build
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
- Each `Paragraph` holds one or more `Opinion`s; one `Opinion` is marked default (fallback when user's mazhab has no specific opinion).
- `Opinion` ↔ `School` is M:N through `OpinionSchool` join.
- `School` — 4 канонические (`IsSystem=true`) + кастомные per-article (`ArticleScopeId` nullable FK).
- `NavigationTree` exposes the article hierarchy for the sidebar.
- `User` (ex-`AdminUser`) authenticates via JWT; `Role` currently always `Admin`; invite tokens bootstrap new admins.

**API surface** (all in `Mktba.Api/Endpoints/`):
- `/auth/*` — login, token refresh
- `/navigationTree` — tree structure
- `/articles/*` — article CRUD
- `/articleContent/*` — article with resolved paragraph opinions
- `/paragraphs/*` — paragraph and opinion operations
- `/schools/*` — system + article-scoped schools
- `/admin/*` — admin utilities (cleanup, AI markdown styling)

**Frontend ↔ Backend:**
- Base URL configured in `mktba.react/src/config.ts` (`http://localhost:5172`)
- CORS allows `localhost:5173` (Vite dev port)
- Auth token stored in `localStorage`; protected routes under `/admin/*`
- HTTP via Axios; server state via React Query
- Global mazhab selection stored in `localStorage['mktba.mazhab']`, exposed through `MazhabContext`

**Database:** PostgreSQL 16. Connection string in `Mktba.Api/appsettings.json`; local dev uses `docker-compose.yml` (service `postgres`).

## Coding conventions

- English for all code symbols; Russian may appear in UI strings/comments/AI prompts.
- No dead code, no commented-out blocks, no TODOs without an issue reference.
- No unrelated refactors mixed into task-specific changes.
- Keep public API/DTO contracts documented.

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

## Active plan

Current multi-iteration MVP plan lives at `C:\Users\shora\.claude\plans\wikiweaver-reflective-yeti.md`. Discrepancy checklist (Figma ↔ current UI) — [docs/figma-checklist.md](docs/figma-checklist.md).
