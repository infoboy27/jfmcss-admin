#!/usr/bin/env bash
# JFMCSS Control — database + uploads backup.
#
#   ./ops/backup.sh                 # write a backup into ./backups
#   BACKUP_DIR=/mnt/x ./ops/backup.sh
#
# Produces:
#   backups/jfmcss-db-<UTC>.dump.gz      (pg_dump custom format, gzipped)
#   backups/jfmcss-uploads-<UTC>.tar.gz  (the app upload volume)
#
# Retention: keeps the 14 newest of each. Run daily from cron:
#   10 3 * * *  cd /home/ubuntu/jfmcss-admin && ./ops/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

PROJECT="${COMPOSE_PROJECT:-jfmcss-admin}"
DB_CONTAINER="${DB_CONTAINER:-${PROJECT}-db-1}"
APP_CONTAINER="${APP_CONTAINER:-${PROJECT}-app-1}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
KEEP="${KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +%FT%TZ)] backup start (project=$PROJECT)"

# ── database ──────────────────────────────────────────────────────────────
PGUSER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PGDB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)"
DB_OUT="$BACKUP_DIR/jfmcss-db-$STAMP.dump.gz"
docker exec "$DB_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" -Fc \
  | gzip -9 > "$DB_OUT"
echo "  db      -> $DB_OUT ($(du -h "$DB_OUT" | cut -f1))"

# ── uploads volume ────────────────────────────────────────────────────────
UP_OUT="$BACKUP_DIR/jfmcss-uploads-$STAMP.tar.gz"
if docker exec "$APP_CONTAINER" sh -c '[ -d /app/data/uploads ]' 2>/dev/null; then
  docker run --rm --volumes-from "$APP_CONTAINER" -v "$BACKUP_DIR":/backup alpine \
    tar czf "/backup/$(basename "$UP_OUT")" -C /app/data uploads
  echo "  uploads -> $UP_OUT ($(du -h "$UP_OUT" | cut -f1))"
else
  echo "  uploads -> skipped (no /app/data/uploads)"
fi

# ── retention ─────────────────────────────────────────────────────────────
prune() {
  ls -1t "$BACKUP_DIR"/$1 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do
    echo "  prune   -> $f"; rm -f "$f"
  done
}
prune 'jfmcss-db-*.dump.gz'
prune 'jfmcss-uploads-*.tar.gz'

echo "[$(date -u +%FT%TZ)] backup done"
