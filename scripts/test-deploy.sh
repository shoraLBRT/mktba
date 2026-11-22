#!/usr/bin/env bash
# CI test of deploy/deploy.sh (X-02, #64), run by the `docker` job after it has built mktba-api:ci
# and mktba-web:ci. In a throwaway stand directory it deploys tag ci, then tag ci2, then rolls back,
# and after each step checks the images of api and web, that the migrations and the reference data
# are in the database (GET /schools/system returns the 4 system schools) and that web serves pages.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
stand=$(mktemp -d)
cp "$root/deploy/docker-compose.yml" "$root/deploy/Caddyfile" "$root/deploy/deploy.sh" "$stand/"
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
  rm -rf "$stand"
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
  # From inside the web container: the API answers with the seeded schools and the SSR server renders.
  compose exec -T web node -e '
    const until = Date.now() + 60000;
    (async function probe() {
      try {
        const schools = await (await fetch("http://api:8080/schools/system")).json();
        const page = await fetch("http://localhost:3000/");
        if (schools.length === 4 && page.status < 500) { console.log("api: 4 schools, web: " + page.status); return; }
        throw new Error("schools " + schools.length + ", web " + page.status);
      } catch (e) {
        if (Date.now() > until) { console.error(String(e)); process.exit(1); }
        setTimeout(probe, 2000);
      }
    })();'
  echo "ok: $tag"
}

export MKTBA_SKIP_PULL=1
"$stand/deploy.sh" deploy mktba ci -staging
check ci
"$stand/deploy.sh" deploy mktba ci2 -staging
check ci2
"$stand/deploy.sh" rollback
check ci
"$stand/deploy.sh" status >/dev/null
echo "deploy.sh: deploy, redeploy and rollback work"
