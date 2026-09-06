# JFMCSS Control — Operations Runbook

Single-host deployment: `ubuntu@163.245.207.38:1600`, repo at `~/jfmcss-admin`,
compose project `jfmcss-admin`, reachable at `https://control.jfmcss.com` via the
shared Traefik edge (`winu-bot-signal-network`).

## Deploy

```bash
ssh -p 1600 ubuntu@163.245.207.38
cd ~/jfmcss-admin
git pull origin main
docker compose -p jfmcss-admin -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`migrate` runs pending SQL migrations and exits before `app` starts. Traefik
returns 404 for ~40 s during the container swap (cosmetic). Verify:

```bash
curl -s https://control.jfmcss.com/api/health/ready   # {"ready":true,...}
```

## Health & probes

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness (DB `SELECT 1`) — also the container HEALTHCHECK |
| `GET /api/health/ready` | readiness (DB + schema) — use for LB / deploy gates |
| `GET /api/metrics` | Prometheus scrape (bearer `METRICS_TOKEN`) |

## Metrics

Set `METRICS_TOKEN` in `.env` (blank = endpoint returns 503). `monitoring-prometheus`
and `jfmcss-admin-app-1` share `winu-bot-signal-network`, so add to
`~/monitoring/prometheus/prometheus.yml`:

```yaml
  - job_name: "jfmcss-control"
    metrics_path: /api/metrics
    authorization:
      credentials: "<METRICS_TOKEN>"
    static_configs:
      - targets: ["jfmcss-admin-app-1:3000"]
        labels: { instance: "control.jfmcss.com", role: "app" }
```

then `docker exec monitoring-prometheus kill -HUP 1` (or restart it).

Key series: `jfmcss_notifications_outbox_pending` / `_failed` (outbox health),
`jfmcss_cron_runs_total{job,outcome}`, `jfmcss_tickets_sla_breached`,
`jfmcss_invoices_overdue_amount`, `jfmcss_api_responses_total{class}`,
`jfmcss_db_pool_waiting`, `jfmcss_db_up`.

Suggested alerts: `jfmcss_db_up == 0`; `jfmcss_notifications_outbox_pending > 50`
for 15m; `increase(jfmcss_cron_runs_total{outcome="error"}[1h]) > 0`;
`jfmcss_notifications_outbox_failed > 0`.

## Logs

Structured JSON lines to stdout/stderr (`LOG_LEVEL` = debug|info|warn|error).
promtail/Loki already tail container stdout. Ad hoc:

```bash
docker logs -f --since 1h jfmcss-admin-app-1 | jq -c 'select(.level=="error")'
docker logs jfmcss-admin-app-1 | jq -c 'select(.job)'   # cron runs
```

## Scheduled jobs (host crontab)

```cron
* * * * *    curl -fsS -X POST https://control.jfmcss.com/api/cron/notifications -H "Authorization: Bearer $CRON_SECRET"
*/10 * * * * curl -fsS -X POST https://control.jfmcss.com/api/cron/sla           -H "Authorization: Bearer $CRON_SECRET"
30 6 * * *   curl -fsS -X POST https://control.jfmcss.com/api/cron/recurring     -H "Authorization: Bearer $CRON_SECRET"
15 6 * * *   curl -fsS -X POST https://control.jfmcss.com/api/cron/daily         -H "Authorization: Bearer $CRON_SECRET"
10 3 * * *   cd /home/ubuntu/jfmcss-admin && ./ops/backup.sh >> backups/backup.log 2>&1
```

## Backup

`ops/backup.sh` writes `backups/jfmcss-db-<UTC>.dump.gz` (pg_dump `-Fc`) and
`backups/jfmcss-uploads-<UTC>.tar.gz`, keeping the 14 newest of each.

```bash
cd ~/jfmcss-admin && ./ops/backup.sh
```

**Off-box copy is required** — `backups/` on the same host is not disaster
recovery. Sync it somewhere else (rclone to object storage, `scp` to another
host, etc.); e.g. `rclone copy backups/ remote:jfmcss-backups/`.

Restore drill (do this quarterly against a throwaway DB):

```bash
docker exec jfmcss-admin-db-1 psql -U jfmcss -d postgres -c "CREATE DATABASE restore_test"
gunzip -c backups/jfmcss-db-<UTC>.dump.gz | docker exec -i jfmcss-admin-db-1 pg_restore -U jfmcss -d restore_test --no-owner
docker exec jfmcss-admin-db-1 psql -U jfmcss -d restore_test -c "SELECT count(*) FROM invoices;"
docker exec jfmcss-admin-db-1 psql -U jfmcss -d postgres -c "DROP DATABASE restore_test"
```

## Restore (production — destructive)

```bash
cd ~/jfmcss-admin
./ops/restore.sh backups/jfmcss-db-<UTC>.dump.gz backups/jfmcss-uploads-<UTC>.tar.gz
# type RESTORE when prompted; it stops the app, recreates the DB, restores, restarts
```

## Secrets

All in `~/jfmcss-admin/.env` on the host (compose fails to start if the required
ones are unset): `POSTGRES_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`, `CRON_SECRET`,
`METRICS_TOKEN`, plus optional `SMTP_*`, `WHATSAPP_*`, `ECF_*`. Rotate
`BOOTSTRAP_ADMIN_PASSWORD` out after the real Super Admin exists. `openssl rand -hex 32`
for `CRON_SECRET` / `METRICS_TOKEN`, `openssl rand -hex 24` for `POSTGRES_PASSWORD`.

## Common incidents

| Symptom | Check | Fix |
|---|---|---|
| 502/404 at the domain | `docker ps`, `docker logs jfmcss-admin-app-1` | `up -d` again; check Traefik is on the edge network |
| `/api/health/ready` → `schema:error` | migrate container logs | re-run `docker compose ... run --rm migrate` |
| Emails not sending | `jfmcss_notifications_outbox_pending` rising; `docker logs` for `SMTP` | verify `SMTP_*`; the outbox retries automatically with backoff |
| Cron not firing | host `crontab -l`; `jfmcss_cron_runs_total` flat | fix crontab; each endpoint is idempotent so a catch-up run is safe |
| DB disk full | `df -h`; `du -sh backups/` | prune `backups/`, `docker system prune`, resize volume |
| Locked out (MFA device lost) | — | another SUPER_ADMIN: `PATCH /api/users/<id> {"resetMfa":true}`; or clear `mfa_*` columns in `psql` |
