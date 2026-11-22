#!/bin/sh
# Backups of one stand (X-04, #158): the database and the `uploads` volume. Runs inside the `backup`
# service of deploy/docker-compose.yml (image postgres:16-alpine, so pg_dump matches the server);
# on the host use deploy.sh (`backup`, `verify`, `restore`). README «Резервные копии».
#
#   mktba-backup schedule          # the service's command: crond runs `once scheduled` on BACKUP_SCHEDULE
#   mktba-backup once [label]      # one backup: scheduled | pre-deploy | manual (default)
#   mktba-backup verify [name]     # restore check of a backup (default: the newest) in a throwaway database
#   mktba-backup restore <name> --yes   # replace the database and the uploads with a backup
#   mktba-backup list
#
# A backup is a directory /backups/<UTC time>-<label>/ with mktba.dump (pg_dump custom format),
# uploads.tar.gz and SHA256SUMS. It is written under a temporary name and renamed when complete, so
# a directory with the final name is always whole. Rotation keeps the newest BACKUP_KEEP scheduled
# and BACKUP_KEEP_PRE_DEPLOY pre-deploy backups; manual ones stay until removed by hand.
#
# Off-site copy (off by default): BACKUP_OFFSITE_COMMAND runs after every backup with the backup's
# path as $1 (and BACKUP_PATH); BACKUP_PACKAGES are Alpine packages it needs (for example rclone or
# openssh-client rsync), installed before it runs; /offsite is deploy/backup-offsite, read-only,
# for its config and keys. A failed copy is reported, the local backup stays.
#
# The database comes from the libpq variables PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
UPLOADS_DIR=${UPLOADS_DIR:-/uploads}
BACKUP_KEEP=${BACKUP_KEEP:-14}
BACKUP_KEEP_PRE_DEPLOY=${BACKUP_KEEP_PRE_DEPLOY:-5}
CHECK_DB=mktba_restore_check

log() { echo "mktba-backup: $*"; }
die() { echo "mktba-backup: $*" >&2; exit 1; }

is_count() { case $1 in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac; }
check_keep() {
  if ! is_count "$BACKUP_KEEP" || ! is_count "$BACKUP_KEEP_PRE_DEPLOY"; then
    die "BACKUP_KEEP and BACKUP_KEEP_PRE_DEPLOY must be numbers"
  fi
}

# Backup names are <yyyymmddThhmmssZ>-<label>; nothing else in BACKUP_DIR is touched.
valid_name() {
  case $1 in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-scheduled | \
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-pre-deploy | \
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z-manual) return 0 ;;
    *) return 1 ;;
  esac
}

# Complete backups, oldest first (the names sort by time). Optional argument: only this label.
backups() {
  for path in "$BACKUP_DIR"/*; do
    name=${path##*/}
    if ! valid_name "$name" || [ ! -d "$path" ]; then continue; fi
    [ -z "${1:-}" ] || [ "${name#*Z-}" = "$1" ] || continue
    echo "$name"
  done
}

psql_q() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }

has_schema() { [ "$(psql_q -c "SELECT to_regclass('public.\"__EFMigrationsHistory\"') IS NOT NULL")" = t ]; }

rotate() {
  label=$1 keep=$2
  total=$(backups "$label" | wc -l)
  [ "$total" -gt "$keep" ] || return 0
  backups "$label" | head -n $((total - keep)) | while read -r old; do
    rm -rf "${BACKUP_DIR:?}/$old"
    log "rotated out $old"
  done
}

offsite() {
  path=$1
  [ -n "${BACKUP_OFFSITE_COMMAND:-}" ] || return 0
  if [ -n "${BACKUP_PACKAGES:-}" ]; then
    # shellcheck disable=SC2086 # a list of package names
    apk add --no-cache --quiet $BACKUP_PACKAGES || { log "ERROR: could not install $BACKUP_PACKAGES"; return 1; }
  fi
  log "off-site copy of ${path##*/}"
  if BACKUP_PATH=$path sh -c "$BACKUP_OFFSITE_COMMAND" mktba-offsite "$path"; then
    log "off-site copy done"
  else
    log "ERROR: off-site copy of ${path##*/} failed; the local backup is kept"
    return 1
  fi
}

once() {
  label=${1:-manual}
  case $label in scheduled | pre-deploy | manual) ;; *) die "unknown label: $label" ;; esac
  check_keep
  [ -d "$UPLOADS_DIR" ] || die "no uploads directory at $UPLOADS_DIR"

  # The very first deployment runs before any migration: there is nothing to keep yet.
  if [ "$label" = pre-deploy ] && ! has_schema; then
    log "the database has no schema yet, nothing to back up before this deployment"
    return 0
  fi

  umask 077
  mkdir -p "$BACKUP_DIR"
  name=$(date -u +%Y%m%dT%H%M%SZ)-$label
  final=$BACKUP_DIR/$name
  tmp=$BACKUP_DIR/.tmp-$name
  [ ! -e "$final" ] || die "$name already exists"
  trap 'rm -rf "$tmp"' EXIT
  mkdir "$tmp"

  log "backing up the database to $name"
  pg_dump --format=custom --no-owner --file="$tmp/mktba.dump"
  log "backing up the uploads"
  tar -czf "$tmp/uploads.tar.gz" -C "$UPLOADS_DIR" .
  (cd "$tmp" && sha256sum mktba.dump uploads.tar.gz >SHA256SUMS)
  mv "$tmp" "$final"
  trap - EXIT
  log "done: $name ($(du -sh "$final" | cut -f1))"

  case $label in
    scheduled) rotate scheduled "$BACKUP_KEEP" ;;
    pre-deploy) rotate pre-deploy "$BACKUP_KEEP_PRE_DEPLOY" ;;
  esac
  # Only a manual run fails on a failed copy: a deployment or the schedule must not stop over it.
  offsite "$final" || [ "$label" != manual ]
}

pick() {
  if [ -n "${1:-}" ]; then
    valid_name "$1" || die "not a backup name: $1 (see: list)"
    [ -d "$BACKUP_DIR/$1" ] || die "no backup $1 in $BACKUP_DIR"
    echo "$1"
  else
    latest=$(backups | tail -n 1)
    [ -n "$latest" ] || die "no backups in $BACKUP_DIR"
    echo "$latest"
  fi
}

check_files() {
  path=$1
  (cd "$path" && sha256sum -c SHA256SUMS >/dev/null) || die "${path##*/}: checksums do not match"
  tar -tzf "$path/uploads.tar.gz" >/dev/null || die "${path##*/}: uploads.tar.gz is unreadable"
  pg_restore --list "$path/mktba.dump" >/dev/null || die "${path##*/}: mktba.dump is unreadable"
}

drop_check_db() { psql_q -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB WITH (FORCE)" >/dev/null; }

# Restores the dump into a throwaway database next to the real one and runs sanity queries there.
verify() {
  name=$(pick "${1:-}")
  path=$BACKUP_DIR/$name
  log "verifying $name"
  check_files "$path"

  drop_check_db
  trap 'drop_check_db' EXIT
  psql_q -d postgres -c "CREATE DATABASE $CHECK_DB" >/dev/null
  pg_restore --no-owner --exit-on-error --dbname="$CHECK_DB" "$path/mktba.dump"

  in_dump=$(pg_restore --list "$path/mktba.dump" | grep -c ' TABLE public ' || true)
  restored=$(psql_q -d "$CHECK_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
  [ "$in_dump" -gt 0 ] || die "$name: the dump has no tables"
  [ "$restored" -eq "$in_dump" ] || die "$name: restored $restored tables of $in_dump"
  migrations=$(psql_q -d "$CHECK_DB" -c 'SELECT count(*) FROM "__EFMigrationsHistory"') ||
    die "$name: no migration history in the restored database"
  [ "$migrations" -gt 0 ] || die "$name: the migration history is empty"
  last=$(psql_q -d "$CHECK_DB" -c 'SELECT max("MigrationId") FROM "__EFMigrationsHistory"')
  counts=$(psql_q -d "$CHECK_DB" -F ' ' -c 'SELECT (SELECT count(*) FROM "Articles"), (SELECT count(*) FROM "Users"), (SELECT count(*) FROM "StoredFiles")')
  files=$(tar -tzf "$path/uploads.tar.gz" | grep -vc '/$' || true)

  log "ok: $name restores: $restored tables, $migrations migrations (last $last), articles/users/stored files: $counts; $files uploaded files in the archive"
}

restore() {
  [ "${2:-}" = --yes ] || die "restore replaces the database and the uploads: run as restore <name> --yes"
  [ -n "${1:-}" ] || die "usage: restore <name> --yes (see: list)"
  name=$(pick "$1")
  path=$BACKUP_DIR/$name
  check_files "$path"
  db=${PGDATABASE:?}

  log "restoring the database $db from $name"
  psql_q -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null
  psql_q -d postgres -c "CREATE DATABASE \"$db\" OWNER \"${PGUSER:?}\"" >/dev/null
  pg_restore --no-owner --exit-on-error --dbname="$db" "$path/mktba.dump"

  log "restoring the uploads from $name"
  owner=$(stat -c '%u:%g' "$UPLOADS_DIR")
  find "$UPLOADS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -xzf "$path/uploads.tar.gz" -C "$UPLOADS_DIR"
  chown -R "$owner" "$UPLOADS_DIR"
  log "restored $name"
}

# Runs crond in the foreground; every job gets the service's environment from a file.
schedule() {
  : "${BACKUP_SCHEDULE:?set BACKUP_SCHEDULE, a cron expression such as 0 3 * * *}"
  check_keep
  umask 077
  export -p >/tmp/mktba-backup.env
  echo "$BACKUP_SCHEDULE . /tmp/mktba-backup.env && sh /usr/local/bin/mktba-backup once scheduled >/proc/1/fd/1 2>/proc/1/fd/2" >/etc/crontabs/root
  state=off
  [ -z "${BACKUP_OFFSITE_COMMAND:-}" ] || state=on
  log "scheduled backups at '$BACKUP_SCHEDULE' (UTC), keeping $BACKUP_KEEP; off-site copy: $state"
  exec crond -f -d 8
}

case ${1:-} in
  schedule) schedule ;;
  once) once "${2:-}" ;;
  verify) verify "${2:-}" ;;
  restore) restore "${2:-}" "${3:-}" ;;
  list) backups ;;
  *) die "usage: mktba-backup schedule | once [scheduled|pre-deploy|manual] | verify [name] | restore <name> --yes | list" ;;
esac
