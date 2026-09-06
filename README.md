# JFMCSS Control

Operations OS for JFMCSS: CRM + sales + projects + fiscal billing + collections + support + renewals + communications + automation + reporting.

## What is live

- Secure database-backed login, revocable sessions, scrypt password hashing and RBAC.
- PostgreSQL data model for users, clients/contacts, opportunities, projects/tasks, fiscal sequences, invoices/items, payments, tickets/messages, assets/renewals, documents, notifications, automation rules, settings and audit log.
- Client 360 with projects, invoices, support, assets, contacts and protected document attachments.
- Sales pipeline with weighted forecast.
- Project workspace with tasks, due dates, priorities, budget, internal cost, margin, MRR, repository and production URL.
- Invoices with dynamic line items, ITBIS, fiscal type, transactional NCF/e-NCF allocation, due date and branded JFMCSS PDF.
- Payment registration updates invoice balances/status automatically.
- Support tickets with priority-based SLA, conversation history, internal-note-ready model and billable minutes.
- Asset/renewal watch for domains, SSL, cloud, servers, licenses and SaaS.
- In-app, SMTP email and Meta WhatsApp notification adapters.
- Daily protected cron endpoint for overdue invoices, due-soon reminders, renewals and SLA risk.
- e-CF provider adapter that is disabled until valid DGII authorization/provider credentials are configured.
- User/RBAC administration, fiscal/SLA settings APIs and audit trail.
- Protected local document storage with authenticated downloads; Docker uses a persistent upload volume.
- Health endpoint and GitHub Actions CI (`tsc` + production Next.js build).

## Local start

```bash
cp .env.example .env
# REQUIRED before first boot: POSTGRES_PASSWORD, BOOTSTRAP_ADMIN_PASSWORD, CRON_SECRET
#   openssl rand -hex 24   # POSTGRES_PASSWORD
#   openssl rand -hex 32   # CRON_SECRET
docker compose up --build
```

Open http://localhost:3000 and sign in with the bootstrap credentials. The first successful login creates the first `SUPER_ADMIN` in PostgreSQL. After that, the bootstrap credentials no longer create accounts.

Without Docker:

```bash
npm ci
createdb jfmcss
export DATABASE_URL='postgresql://...'
npm run db:init
npm run dev
```

## Quality gates

```bash
npm run lint        # eslint (eslint-config-next)
npm test            # vitest unit tests
npm run build       # production build (also regenerates route types)
npm run typecheck   # tsc --noEmit (run after build)
```

CI runs all four plus `npm audit --audit-level=high` on every push and PR.

## Production deploy (single host + Traefik)

The `docker-compose.prod.yml` overlay drops the published app port and routes
`CONTROL_HOST` through a shared Traefik edge network with an ACME certificate:

```bash
docker compose -p jfmcss-admin \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Health probes: `GET /api/health` (liveness), `GET /api/health/ready` (DB + schema).

## Daily automation

Call once per day from cron or your infrastructure scheduler:

```bash
curl -X POST https://control.example.com/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Fiscal / DGII note

`ECF_ENABLED` defaults to `false`. JFMCSS Control can allocate configured fiscal sequences and build invoice records/PDFs, but real e-CF submission must only be enabled after the issuing taxpayer has the required DGII authorization/certificate/provider configuration. The provider adapter intentionally fails closed when e-CF is enabled without credentials.

## Production checklist

1. Set a strong bootstrap password, create the real Super Admin, then rotate/remove the bootstrap password from deployment secrets.
2. Use managed PostgreSQL backups and TLS (`PG_SSL=true` when required by the provider).
3. Mount `UPLOAD_DIR` on persistent encrypted storage or replace the local adapter with object storage.
4. Configure SMTP and/or WhatsApp credentials if outbound notifications are desired.
5. Configure an authorized DGII/e-CF integration before enabling `ECF_ENABLED`.
6. Schedule `/api/cron/daily` with `CRON_SECRET`.
7. Put the app behind HTTPS and restrict database access to the app network.
8. Review [`docs/AUDIT.md`](docs/AUDIT.md) for the current hardening status and open items.

## Main API surface

- Auth: `/api/auth/login`, `/logout`, `/me`
- Dashboard: `/api/dashboard`
- CRM: `/api/clients`, `/api/clients/:id`, `/api/contacts`
- Sales: `/api/opportunities`
- Projects: `/api/projects`, `/api/tasks`
- Billing: `/api/invoices`, `/api/invoices/:id`, `/api/invoices/:id/pdf`, `/api/payments`
- Support: `/api/tickets`, `/api/tickets/:id/messages`
- Assets: `/api/assets`
- Documents: `/api/documents`, `/api/documents/:id/download`
- Communications: `/api/notifications`
- Administration: `/api/users`, `/api/settings`, `/api/audit`, `/api/automations`
- Operations: `/api/cron/daily`, `/api/health`
