# JFMCSS Control

Operations OS for JFMCSS: CRM + sales + projects + fiscal billing + collections + support + renewals + communications + automation + reporting.

## What is live

- Secure database-backed login, revocable sessions, scrypt password hashing and RBAC.
- PostgreSQL schema for users, clients, contacts, opportunities, projects/tasks, fiscal sequences, invoices/items, payments, tickets/messages, assets/renewals, documents, notifications, automation rules, settings and audit log.
- Client 360 data model and client portal-safe scoping for CLIENT users.
- Sales pipeline with weighted forecast.
- Projects with budget, internal cost, margin, MRR, repository and production URL.
- Invoices with dynamic line items, ITBIS, fiscal type, transactional NCF/e-NCF allocation, due date and branded JFMCSS PDF.
- Payment registration updates invoice balances/status automatically.
- Support tickets with priority-based SLA, conversation history, internal notes support and billable minutes.
- Asset/renewal watch for domains, SSL, cloud, servers, licenses and SaaS.
- In-app, SMTP email and Meta WhatsApp notification adapters.
- Daily protected cron endpoint for overdue invoices, due-soon reminders, renewals and SLA risk.
- e-CF provider adapter that is disabled until valid DGII authorization/provider credentials are configured.
- Audit trail for sensitive writes.
- Health endpoint and GitHub Actions CI.

## Local start

```bash
cp .env.example .env
# Change BOOTSTRAP_ADMIN_PASSWORD before starting.
docker compose up --build
```

Open http://localhost:3000 and sign in with the bootstrap credentials. The first successful login creates the first `SUPER_ADMIN` in PostgreSQL. After that, the bootstrap credentials no longer create accounts.

Without Docker:

```bash
npm install
createdb jfmcss
export DATABASE_URL='postgresql://...'
npm run db:init
npm run dev
```

## Daily automation

Call once per day from cron, GitHub Actions, your scheduler, or infrastructure platform:

```bash
curl -X POST https://control.example.com/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Fiscal / DGII note

`ECF_ENABLED` defaults to `false`. JFMCSS Control can allocate configured fiscal sequences and build invoice records/PDFs, but real e-CF submission must only be enabled after the issuing taxpayer has the required DGII authorization/certificate/provider configuration. The adapter intentionally fails closed when e-CF is enabled without credentials.

## Important production checklist

1. Set a strong bootstrap password, create the real Super Admin, then rotate/remove the bootstrap password from deployment secrets.
2. Use managed PostgreSQL backups and TLS (`PG_SSL=true` when required by the provider).
3. Configure SMTP and/or WhatsApp credentials if outbound notifications are desired.
4. Configure an authorized DGII/e-CF integration before enabling `ECF_ENABLED`.
5. Schedule `/api/cron/daily` with `CRON_SECRET`.
6. Put the app behind HTTPS and restrict database access to the app network.

## API surface

- `/api/auth/login`, `/logout`, `/me`
- `/api/dashboard`
- `/api/clients`, `/api/clients/:id`
- `/api/opportunities`
- `/api/projects`
- `/api/invoices`, `/api/invoices/:id`, `/api/invoices/:id/pdf`
- `/api/payments`
- `/api/tickets`, `/api/tickets/:id/messages`
- `/api/assets`
- `/api/notifications`
- `/api/users`, `/api/users/:id`
- `/api/automations`
- `/api/cron/daily`
- `/api/health`
