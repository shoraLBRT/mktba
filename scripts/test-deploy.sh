#!/usr/bin/env bash
# CI test of deploy/deploy.sh (X-02, #64), run by the `docker` job after it has built mktba-api:ci
# and mktba-web:ci. In a throwaway stand directory it deploys tag ci, then tag ci2, then rolls back,
# and after each step checks the images of api and web, that the migrations and the reference data
# are in the database (GET /schools/system returns the 4 system schools), that web serves pages and
# that both containers are healthy with readiness reporting the database (X-05, #159).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
stand=$(mktemp -d)
cp "$root/deploy/docker-compose.yml" "$root/deploy/Caddyfile" "$root/deploy/deploy.sh" "$root/deploy/backup.sh" "$stand/"
# The test hosts cannot get Let's Encrypt certificates: Caddy issues its own (X-06 header check).
# shellcheck disable=SC2016 # matches the Caddyfile's literal {$ACME_EMAIL} placeholder
sed -i 's/^\temail {\$ACME_EMAIL}$/&\n\tlocal_certs/' "$stand/Caddyfile"
grep -q '^	local_certs$' "$stand/Caddyfile" || { echo "could not add local_certs to the Caddyfile" >&2; exit 1; }
sed -e 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=mktba-deploy-test/' \
    -e 's/^SITE_HOST=.*/SITE_HOST=mktba.example/' \
    -e 's/^API_HOST=.*/API_HOST=api.mktba.example/' \
    -e 's/^ACME_EMAIL=$/ACME_EMAIL=ci@example.com/' \
    -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=ci/' \
    -e "s/^JWT_SIGNING_KEY=\$/JWT_SIGNING_KEY=$(openssl rand -hex 32)/" \
    "$root/deploy/.env.example" >"$stand/.env"

compose() { docker compose -f "$stand/docker-compose.yml" "$@"; }
cleanup() {
  status=$?
  if [[ $status -ne 0 ]]; then compose logs --no-color --tail 80 || true; fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  # The backup container writes backups/ as root.
  rm -rf "$stand" 2>/dev/null || sudo rm -rf "$stand" || true
  exit "$status"
}
trap cleanup EXIT

# Two tags of the same build stand in for two releases.
docker tag mktba-api:ci mktba-api:ci2
docker tag mktba-web:ci mktba-web:ci-staging
docker tag mktba-web:ci mktba-web:ci2-staging

image_of() { docker inspect --format '{{.Config.Image}}' "$(compose ps -q "$1")"; }

check() {
  local tag=$1
  [[ $(image_of api) == "mktba-api:$tag" ]] || { echo "api runs $(image_of api), expected mktba-api:$tag" >&2; return 1; }
  [[ $(image_of web) == "mktba-web:$tag-staging" ]] || { echo "web runs $(image_of web), expected mktba-web:$tag-staging" >&2; return 1; }
  [[ $(tail -n 1 "$stand/.deploy-history") == "mktba $tag -staging" ]] || { echo "history does not end with $tag" >&2; return 1; }
  local service health
  for service in api web; do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$(compose ps -q "$service")")
    [[ $health == healthy ]] || { echo "$service healthcheck: $health" >&2; return 1; }
  done
  # From inside the web container: the API answers with the seeded schools and the SSR server renders.
  compose exec -T web node -e '
    const until = Date.now() + 60000;
    (async function probe() {
      try {
        const schools = await (await fetch("http://api:8080/schools/system")).json();
        const page = await fetch("http://localhost:3000/");
        const ready = await (await fetch("http://api:8080/health/ready")).json();
        const database = ready.checks?.database?.status;
        if (schools.length === 4 && page.status < 500 && database === "Healthy") {
          console.log("api: 4 schools, database " + database + ", web: " + page.status);
          return;
        }
        throw new Error("schools " + schools.length + ", database " + database + ", web " + page.status);
      } catch (e) {
        if (Date.now() > until) { console.error(String(e)); process.exit(1); }
        setTimeout(probe, 2000);
      }
    })();'
  echo "ok: $tag"
}

# X-06 (#160): through Caddy over HTTPS, both hosts send HSTS and nosniff, the page its CSP from the
# web server and the API its own CSP. Run from the web container, which shares Caddy's network.
check_headers() {
  compose exec -T web node -e '
    const https = require("node:https");
    const get = (host, path) => new Promise((resolve, reject) => {
      https.get({ host: "caddy", port: 443, path, servername: host, headers: { host }, rejectUnauthorized: false },
        (res) => { res.resume(); resolve(res.headers); }).on("error", reject);
    });
    const expect = (what, actual, pattern) => {
      if (!pattern.test(actual ?? "")) throw new Error(what + ": " + actual);
    };
    const until = Date.now() + 60000;
    (async function probe() {
      try {
        for (const [host, path, csp] of [
          ["mktba.example", "/", /frame-ancestors .self. https:\/\/metrika\.yandex\.ru/],
          ["mktba.example", "/robots.txt", /^/],
          ["api.mktba.example", "/schools/system", /^default-src .none.; frame-ancestors .none./],
        ]) {
          const h = await get(host, path);
          expect(host + path + " HSTS", h["strict-transport-security"], /^max-age=31536000$/);
          expect(host + path + " nosniff", h["x-content-type-options"], /^nosniff$/);
          expect(host + path + " CSP", h["content-security-policy"], csp);
          if (h["server"]) throw new Error(host + path + " sends Server: " + h["server"]);
        }
        console.log("security headers: ok");
      } catch (e) {
        if (Date.now() > until) { console.error(String(e)); process.exit(1); }
        setTimeout(probe, 2000);
      }
    })();'
}

export MKTBA_SKIP_PULL=1
"$stand/deploy.sh" deploy mktba ci -staging
check ci
check_headers
"$stand/deploy.sh" deploy mktba ci2 -staging
check ci2
# X-04 (#158): the first deployment had no schema to save; the second one saved it before migrating.
pre_deploy=$("$stand/deploy.sh" backups | grep -c -- '-pre-deploy$' || true)
[[ $pre_deploy -eq 1 ]] || { echo "expected 1 pre-deploy backup, found $pre_deploy" >&2; exit 1; }
[[ $(compose ps --status running -q backup) ]] || { echo "the backup service is not running" >&2; exit 1; }
"$stand/deploy.sh" rollback
check ci
"$stand/deploy.sh" status >/dev/null
echo "deploy.sh: deploy, redeploy and rollback work"
