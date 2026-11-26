#!/usr/bin/env bash
# The checks of CI's backend, frontend and api-contract jobs, run locally before a push, cheapest first
# (README «Проверка перед пушем»). They fail most often on a pushed branch: a package-lock.json that
# `npm ci` refuses, a stale API contract, the error catalog and the authorization matrix. e2e and
# docker are left to CI.
#
#   bash scripts/pre-push.sh            # everything below
#   bash scripts/pre-push.sh --no-dotnet  # skip the .NET build and tests (a front-end-only change)
#
# The .NET tests need the compose `postgres` (or MKTBA_TEST_DB_CONNECTION), as `dotnet test` does.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
web="$root/mktba.react"
run_dotnet=1
[ "${1:-}" = "--no-dotnet" ] && run_dotnet=0

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

cd "$root"
base="$(git merge-base HEAD origin/main 2>/dev/null || true)"

step "package-lock.json"
if [ -n "$base" ] \
  && ! git diff --quiet "$base" -- mktba.react/package-lock.json \
  && git diff --quiet "$base" -- mktba.react/package.json; then
  fail "package-lock.json changed while package.json did not. Restore it: git checkout origin/main -- mktba.react/package-lock.json"
fi
(cd "$web" && npm ci --no-audit --no-fund) || fail "npm ci: package.json and package-lock.json are out of sync"
git diff --quiet -- mktba.react/package-lock.json || fail "npm ci rewrote package-lock.json"

if [ "$run_dotnet" = 1 ]; then
  step "API contract"
  (cd "$web" && npm run gen:api) || fail "npm run gen:api"
  [ -z "$(git status --porcelain -- mktba.react/src/shared/api)" ] \
    || fail "the API contract is out of date: commit mktba.react/src/shared/api after npm run gen:api"
fi

step "frontend"
(cd "$web" && npm run lint) || fail "npm run lint"
(cd "$web" && npm test) || fail "npm test"
(cd "$web" && npm run build) || fail "npm run build"
(cd "$web" && npm run size) || fail "npm run size"

if [ "$run_dotnet" = 1 ]; then
  step "backend"
  dotnet build Mktba.sln --configuration Release || fail "dotnet build"
  dotnet test Mktba.sln --no-build --configuration Release --verbosity minimal || fail "dotnet test"
fi

printf '\nAll pre-push checks passed.\n'
