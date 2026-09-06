#!/usr/bin/env bash
# JFMCSS Control — restore from a backup produced by ops/backup.sh.
#
#   ./ops/restore.sh backups/jfmcss-db-<UTC>.dump.gz [backups/jfmcss-uploads-<UTC>.tar.gz]
#
# DESTRUCTIVE: drops and recreates the app database. Requires typing "RESTORE".
set -euo pipefail

DB_DUMP="${1:-}"
UPLOADS_TAR="${2:-}"
PROJECT="${COMPOSE_PROJECT:-jfmcss-admin}"
DB_CONTAINER="${DB_CONTAINER:-${PROJECT}-db-1}"
APP_CONTAINER="${APP_CONTAINER:-${PROJECT}-app-1}"

[ -f "$DB_DUMP" ] || { echo "usage: $0 <db-dump.gz> [uploads.tar.gz]"; exit 1; }

PGUSER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PGDB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)"

cat <<EOF
About to RESTORE:
  database   : $PGDB  (will be DROPPED and recreated on $DB_CONTAINER)
  from dump  : $DB_DUMP
  uploads    : ${UPLOADS_TAR:-<none>}
EOF
read -rp 'Type RESTORE to proceed: ' confirm
[ "$confirm" = "RESTORE" ] || { echo "aborted"; exit 1; }

echo "-- stopping app so nothing writes mid-restore"
docker stop "$APP_CONTAINER" >/dev/null || true

echo "-- terminating connections + recreating $PGDB"
docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PGDB' AND pid<>pg_backend_pid();" >/dev/null
docker exec "$DB_CONTAINER" psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$PGDB\";" -c "CREATE DATABASE \"$PGDB\";" >/dev/null

echo "-- restoring dump"
gunzip -c "$DB_DUMP" | docker exec -i "$DB_CONTAINER" pg_restore -U "$PGUSER" -d "$PGDB" --no-owner --clean --if-exists
echo "-- db restored"

if [ -n "$UPLOADS_TAR" ] && [ -f "$UPLOADS_TAR" ]; then
  echo "-- restoring uploads volume"
  docker run --rm --volumes-from "$APP_CONTAINER" -v "$(cd "$(dirname "$UPLOADS_TAR")" && pwd)":/backup alpine \
    sh -c "rm -rf /app/data/uploads/* && tar xzf /backup/$(basename "$UPLOADS_TAR") -C /app/data"
  echo "-- uploads restored"
fi

echo "-- starting app"
docker start "$APP_CONTAINER" >/dev/null
echo "done. verify: curl -s https://control.jfmcss.com/api/health/ready"
