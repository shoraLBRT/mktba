#!/usr/bin/env bash
# Deploys one image tag to the stand in this directory (X-02, #64). The directory holds
# docker-compose.yml, Caddyfile, backup.sh, .env (never committed) and this script; the Deploy
# workflow copies all but .env here and runs the script over SSH. On the server it can be run by hand:
#
#   ./deploy.sh deploy ghcr.io/<owner>/mktba sha-1a2b3c4 -staging   # prefix, tag, web tag suffix
#   ./deploy.sh rollback    # deploy again the entry before the current one in .deploy-history
#   ./deploy.sh status      # current entry and the containers
#   ./deploy.sh backup      # back up the database and the uploads now (X-04, #158)
#   ./deploy.sh backups     # list the backups
#   ./deploy.sh verify [name]          # restore check of a backup (default: the newest)
#   ./deploy.sh restore <name> --yes   # put a backup back (stops api and web, migrates, starts them)
#
# Order: pull both images -> back up the database and the uploads (`backup` service, label
# pre-deploy; a failure stops the deployment) -> run `migrate` as a separate one-shot step
# (migrations + reference data) -> only if it succeeded, switch api and web to the new images ->
# make sure caddy and the backup schedule are up. A failed
# pull or migration leaves the running api and web untouched. A rollback does not undo migrations:
# every migration must keep the previous release working (add first, drop in a later release).
#
# MKTBA_SKIP_PULL=1 uses images already present locally (the CI test of this script).
set -euo pipefail

cd "$(dirname "$0")"
HISTORY=.deploy-history
WAIT_TIMEOUT=${MKTBA_WAIT_TIMEOUT:-180}

compose() { docker compose -f docker-compose.yml "$@"; }
die() { echo "deploy.sh: $*" >&2; exit 1; }

valid() { [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._/:-]{0,200}$ ]]; }

deploy() {
  local prefix=$1 tag=$2 suffix=${3:-}
  valid "$prefix" || die "bad image prefix: $prefix"
  valid "$tag" || die "bad tag: $tag"
  [[ -z $suffix || $suffix =~ ^-[a-z0-9]{1,32}$ ]] || die "bad web tag suffix: $suffix"
  [[ -f .env ]] || die "no .env next to docker-compose.yml (copy .env.example and fill it in)"

  export MKTBA_IMAGE_PREFIX=$prefix MKTBA_TAG=$tag MKTBA_WEB_TAG_SUFFIX=$suffix
  echo "==> Deploying $prefix-api:$tag and $prefix-web:$tag$suffix"

  if [[ ${MKTBA_SKIP_PULL:-} != 1 ]]; then
    echo "==> Pulling images"
    compose pull --quiet migrate api web
  fi

  # Starts postgres (and waits until it is healthy) and saves what the migrations are about to change.
  echo "==> Backing up before the migrations"
  compose run --rm --no-TTY backup once pre-deploy

  # Runs the migrations with the new image, exits.
  echo "==> Applying migrations"
  compose run --rm --no-TTY migrate

  # --no-deps: migrate has already run; api and web are recreated only when their image changed.
  echo "==> Switching api and web"
  compose up -d --no-build --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" api web
  compose up -d --no-build --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" caddy
  compose up -d --no-build --no-deps backup

  printf '%s %s %s\n' "$prefix" "$tag" "$suffix" >>"$HISTORY"
  echo "==> Deployed $tag"
}

rollback() {
  [[ -f $HISTORY ]] || die "nothing deployed yet ($HISTORY is missing)"
  local previous
  previous=$(tail -n 2 "$HISTORY" | head -n 1)
  [[ $(wc -l <"$HISTORY") -ge 2 ]] || die "no previous deployment in $HISTORY"
  echo "==> Rolling back to: $previous"
  # shellcheck disable=SC2086 # the entry is three words: prefix, tag, suffix
  deploy $previous
}

status() {
  if [[ -f $HISTORY ]]; then
    echo "Current: $(tail -n 1 "$HISTORY")"
  else
    echo "Current: nothing deployed by deploy.sh yet"
  fi
  compose ps
}

# The backup commands run deploy/backup.sh in a one-off `backup` container (X-04, #158).
backup_cmd() { compose run --rm --no-TTY backup "$@"; }

restore() {
  local name=${1:-} confirm=${2:-}
  [[ -n $name && $confirm == --yes ]] || die "usage: deploy.sh restore <name> --yes (replaces the database and the uploads; names: deploy.sh backups)"
  echo "==> Stopping api and web"
  compose stop api web
  backup_cmd restore "$name" --yes
  if [[ -f $HISTORY ]]; then
    # The backup may predate the current migrations: migrate it to the deployed version, then start
    # api and web again. The history does not change.
    local prefix tag suffix
    read -r prefix tag suffix < <(tail -n 1 "$HISTORY")
    export MKTBA_IMAGE_PREFIX=$prefix MKTBA_TAG=$tag MKTBA_WEB_TAG_SUFFIX=${suffix:-}
    echo "==> Migrating the restored database to $tag"
    compose run --rm --no-TTY migrate
    compose up -d --no-build --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" api web
    echo "==> Restored $name, running $tag"
  else
    echo "==> Restored. Start the stand again: docker compose -f docker-compose.yml up -d"
  fi
}

case ${1:-} in
  deploy) shift; [[ $# -ge 2 ]] || die "usage: deploy.sh deploy <image-prefix> <tag> [web-tag-suffix]"; deploy "$@" ;;
  rollback) rollback ;;
  status) status ;;
  backup) backup_cmd once manual ;;
  backups) backup_cmd list ;;
  verify) backup_cmd verify "${2:-}" ;;
  restore) shift; restore "$@" ;;
  *) die "usage: deploy.sh deploy <image-prefix> <tag> [web-tag-suffix] | rollback | status | backup | backups | verify [name] | restore <name> --yes" ;;
esac
