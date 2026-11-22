#!/usr/bin/env bash
# Deploys one image tag to the stand in this directory (X-02, #64). The directory holds
# docker-compose.yml, Caddyfile, .env (never committed) and this script; the Deploy workflow copies
# the first three files here and runs the script over SSH. On the server it can be run by hand:
#
#   ./deploy.sh deploy ghcr.io/<owner>/mktba sha-1a2b3c4 -staging   # prefix, tag, web tag suffix
#   ./deploy.sh rollback    # deploy again the entry before the current one in .deploy-history
#   ./deploy.sh status      # current entry and the containers
#
# Order: pull both images -> run `migrate` as a separate one-shot step (migrations + reference data)
# -> only if it succeeded, switch api and web to the new images -> make sure caddy is up. A failed
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

  # Starts postgres (and waits until it is healthy), runs the migrations with the new image, exits.
  echo "==> Applying migrations"
  compose run --rm --no-TTY migrate

  # --no-deps: migrate has already run; api and web are recreated only when their image changed.
  echo "==> Switching api and web"
  compose up -d --no-build --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" api web
  compose up -d --no-build --no-deps --wait --wait-timeout "$WAIT_TIMEOUT" caddy

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

case ${1:-} in
  deploy) shift; [[ $# -ge 2 ]] || die "usage: deploy.sh deploy <image-prefix> <tag> [web-tag-suffix]"; deploy "$@" ;;
  rollback) rollback ;;
  status) status ;;
  *) die "usage: deploy.sh deploy <image-prefix> <tag> [web-tag-suffix] | rollback | status" ;;
esac
