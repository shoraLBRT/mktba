#!/usr/bin/env bash
# CI test of deploy/backup.sh (X-04, #158), run by the `docker` job after it has built mktba-api:ci.
# A throwaway stand (postgres, migrate, backup) gets a sentinel table and an uploaded file, then:
# the cron schedule makes a backup and its off-site copy; the restore check passes on it and fails on
# a broken copy; `deploy.sh restore` brings back the database and the uploads after they changed;
# rotation keeps BACKUP_KEEP scheduled and BACKUP_KEEP_PRE_DEPLOY pre-deploy backups.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
stand=$(mktemp -d)
cp "$root/deploy/docker-compose.yml" "$root/deploy/Caddyfile" "$root/deploy/deploy.sh" "$root/deploy/backup.sh" "$stand/"
# The off-site copy goes to a directory next to the backups; single quotes keep $1 for the hook.
# shellcheck disable=SC2016 # literal $1, expanded by the hook in the container
sed -e 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=mktba-backup-test/' \
    -e 's/^SITE_HOST=.*/SITE_HOST=mktba.example/' \
    -e 's/^API_HOST=.*/API_HOST=api.mktba.example/' \
    -e 's/^ACME_EMAIL=$/ACME_EMAIL=ci@example.com/' \
    -e 's/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=ci/' \
    -e "s/^JWT_SIGNING_KEY=\$/JWT_SIGNING_KEY=$(openssl rand -hex 32)/" \
    -e 's|^BACKUP_OFFSITE_COMMAND=$|BACKUP_OFFSITE_COMMAND='\''mkdir -p /backups/offsite \&\& cp -R "$1" /backups/offsite/'\''|' \
    "$root/deploy/.env.example" >"$stand/.env"
cat >>"$stand/.env" <<'EOF'
BACKUP_SCHEDULE="* * * * *"
BACKUP_KEEP=2
BACKUP_KEEP_PRE_DEPLOY=1
EOF
grep -q '^BACKUP_OFFSITE_COMMAND=.mkdir' "$stand/.env" || { echo "could not set BACKUP_OFFSITE_COMMAND" >&2; exit 1; }

export MKTBA_IMAGE_PREFIX=mktba MKTBA_TAG=ci
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

fail() { echo "FAIL: $*" >&2; exit 1; }
sql() { compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -At -U mktba -d mktba -c "$1"; }
# A shell in a one-off backup container (the uploads volume and the backups directory mounted).
in_backup() { compose run --rm --no-TTY --no-deps --entrypoint sh backup -c "$1"; }
backup() { compose run --rm --no-TTY backup "$@"; }
count() { backup list | grep -c -- "-$1\$" || true; }

compose up -d --wait postgres
compose run --rm --no-TTY migrate
sql "CREATE TABLE backup_sentinel (value text); INSERT INTO backup_sentinel VALUES ('before');"
in_backup 'mkdir -p /uploads/2026/11 && echo picture >/uploads/2026/11/a.webp'

echo "==> The schedule makes a backup and its off-site copy"
compose up -d backup
for _ in $(seq 1 50); do
  if compose exec -T backup sh -c 'ls /backups/offsite/*-scheduled/SHA256SUMS' >/dev/null 2>&1; then break; fi
  sleep 2
done
compose exec -T backup sh -c 'ls /backups/offsite/*-scheduled/SHA256SUMS' >/dev/null 2>&1 ||
  fail "no scheduled backup with an off-site copy within 100 s"
compose stop backup
[[ $(compose logs --no-color backup) == *'off-site copy done'* ]] || fail "the log does not report the off-site copy"

echo "==> The restore check passes on the newest backup"
scheduled=$(backup list | tail -n 1)
[[ $scheduled == *-scheduled ]] || fail "the newest backup is $scheduled"
backup verify | tee "$stand/verify.log"
grep -q "ok: $scheduled restores" "$stand/verify.log" || fail "verify did not report $scheduled"
[[ $(sql "SELECT count(*) FROM pg_database WHERE datname = 'mktba_restore_check'") == 0 ]] ||
  fail "the throwaway database was left behind"

echo "==> The restore check fails on a broken backup"
broken=20000101T000000Z-manual
in_backup "cp -R /backups/$scheduled /backups/$broken && head -c 2000 /backups/$scheduled/mktba.dump >/backups/$broken/mktba.dump"
if backup verify "$broken"; then fail "verify passed a backup whose checksum does not match"; fi
in_backup "cd /backups/$broken && sha256sum mktba.dump uploads.tar.gz >SHA256SUMS"
if backup verify "$broken"; then fail "verify passed a truncated dump"; fi
in_backup "rm -rf /backups/$broken"

echo "==> deploy.sh restore brings back the database and the uploads"
"$stand/deploy.sh" backup
manual=$(backup list | tail -n 1)
[[ $manual == *-manual ]] || fail "the newest backup is $manual, expected the manual one"
sql "UPDATE backup_sentinel SET value = 'after';"
in_backup 'rm /uploads/2026/11/a.webp && echo other >/uploads/b.webp'
if "$stand/deploy.sh" restore "$manual"; then fail "restore ran without --yes"; fi
[[ $(sql "SELECT value FROM backup_sentinel") == after ]] || fail "restore without --yes changed the database"
"$stand/deploy.sh" restore "$manual" --yes
[[ $(sql "SELECT value FROM backup_sentinel") == before ]] || fail "the database was not restored"
[[ $(sql 'SELECT count(*) FROM "__EFMigrationsHistory"') -gt 0 ]] || fail "the restored database has no migrations"
# shellcheck disable=SC2016 # expanded in the container
in_backup '[ "$(cat /uploads/2026/11/a.webp)" = picture ] && [ ! -e /uploads/b.webp ]' ||
  fail "the uploads were not restored"

echo "==> Rotation"
for _ in 1 2 3; do backup once scheduled; sleep 1; done
for _ in 1 2; do backup once pre-deploy; sleep 1; done
[[ $(count scheduled) -eq 2 ]] || fail "expected 2 scheduled backups (BACKUP_KEEP=2), found $(count scheduled)"
[[ $(count pre-deploy) -eq 1 ]] || fail "expected 1 pre-deploy backup, found $(count pre-deploy)"
[[ $(count manual) -eq 1 ]] || fail "manual backups must not be rotated, found $(count manual)"

echo "backup.sh: schedule, off-site copy, restore check, restore and rotation work"
