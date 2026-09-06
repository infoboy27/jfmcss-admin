# JFMCSS Control — Technical Audit & Roadmap

_Audit date: 2026-09-06 · Reviewed commit: `cbf4801` · Auditor: engineering ownership pass_

This document is the single source of truth for the state of JFMCSS Control and
the plan to take it to production. It is updated as items are resolved.

---

## 1. Executive summary

_Started as a ~15 % prototype. After the ownership pass it is a **working
revenue-and-service operations core**, deployed at `https://control.jfmcss.com`._

**Done (Phase 0–3, ~35 commits, CI green incl. a DB integration job):**
security hardening (headers/CSP-nonce, login rate limit, Origin guard) ·
versioned migrations · standard API envelope + Zod on every mutation route ·
centralized client-scope guard · notification outbox + 4 crons · **proposals**
(PDF + public accept link + one-tx conversion) · **recurring services** · **credit
notes** · **SLA engine** (pausable clock, 50/75/90/100 % alerts, escalation) ·
**billable time → invoice** · 54 tests (49 unit + 5 integration).

**Still to build:** health score · JFMCSS Pulse / Next-Best-Action · reports ·
renewal-watch dashboard · notification center UI · automation builder · global
search · AR aging + collections · CSAT · MFA · design-system extraction ·
accessibility · pagination. See §3–4.

What is genuinely solid:

- Clean PostgreSQL domain model (users, clients/contacts, opportunities,
  projects/tasks, fiscal sequences, invoices/items, payments, tickets/messages,
  assets, documents, notifications, automation rules, settings, audit log) with
  real `CHECK` constraints and foreign keys.
- Password auth done correctly: `scrypt` with per-user salt, constant-time
  compare, session tokens stored only as SHA-256 hashes, revocable sessions.
- Per-route RBAC via `requireUser([roles])` and a working `CLIENT` portal scope.
- Fiscal number allocation is race-safe (`SELECT … FOR UPDATE`) and invoice
  numbering uses a transaction advisory lock.
- Adapters (SMTP, WhatsApp, e-CF) that fail closed / degrade to "pending
  configuration" instead of crashing.
- The `LiveControl` workspace is wired to real APIs end to end.

Remaining gaps are the **intelligence layer** (health score, Pulse, reports,
automation builder, search) and **polish** (design system, client-portal shell,
accessibility, MFA, pagination) — the money and service cycles work today.

---

## 2. Findings by severity

Status legend: ✅ fixed in the ownership pass · 🔧 in progress · ⬜ open

### CRITICAL

| # | Finding | Status |
|---|---------|--------|
| C1 | `nodemailer@7` carries multiple **high**-severity advisories (SMTP command injection, CRLF header injection). | ✅ bumped to `nodemailer@10`, `npm audit` clean, CI now fails on `--audit-level=high`. |
| C2 | **No `package-lock.json`** committed and CI used `npm install` → non-reproducible builds, unpinned transitive deps. | ✅ lockfile committed, CI uses `npm ci`. |
| C3 | `docker-compose.yml` shipped hardcoded DB credentials (`jfmcss/jfmcss`), `BOOTSTRAP_ADMIN_PASSWORD=change-me-now`, and **published Postgres on `0.0.0.0:5432`**. | ✅ all secrets come from `.env` (compose fails fast if unset), Postgres bound to `127.0.0.1`. |
| C4 | **No security headers** — no CSP, HSTS, `X-Content-Type-Options`, frame protection, referrer policy. | ✅ added in `next.config.ts` (strict CSP + HSTS in prod), `x-powered-by` disabled. |
| C5 | **No rate limiting on `/api/auth/login`** → unlimited credential stuffing / password spraying. | ✅ per-IP + per-account limiter, failed attempts audited. |
| C6 | `dashboard` route string-interpolated `clientId` into SQL (escaped, low exploitability, still wrong). | ✅ bound `$1::uuid` parameter; pipeline aggregate now also scoped for `CLIENT`. |

### HIGH

| # | Finding | Status |
|---|---------|--------|
| H1 | **No CSRF / Origin defense.** JSON routes are largely protected by `SameSite=lax` + non-simple content type, but `/api/documents` POST accepts `multipart/form-data`, which an auto-submitting cross-site form can send with the victim's cookie. | ✅ `src/proxy.ts` rejects any state-changing request whose `Origin` isn't this host. |
| H2 | **No automated tests** for authentication, RBAC, cross-client isolation, invoice math, NCF concurrency, payment reconciliation, recurring-invoice idempotency, SLA, file authorization, proposal conversion — the exact list the brief calls out. | ✅ 54 tests. Unit: invoice math, rate limiter, validators, envelope, Zod schemas, client-scope guard, SLA snapshot. Integration (real Postgres in CI): fiscal-sequence 25-way concurrency, recurring idempotency, proposal conversion, payment reconciliation, support-time billing. HTTP-layer auth/RBAC E2E still worth adding. |
| H3 | `nextHumanNumber()` (tickets, projects) reads `MAX(number)` then `+1` with **no lock/transaction** → concurrent creation collides on the unique index. Invoice numbering was fixed; these were not. | ✅ takes a transaction advisory lock; ticket/project creation runs allocation + insert in one `tx()`. |
| H4 | Notifications (`sendEmail`, `sendWhatsApp`) are **awaited inside the request handler** — a slow SMTP host stalls invoice/payment/ticket responses. | ✅ `sendEmail`/`sendWhatsApp` now only write a PENDING outbox row; `/api/cron/notifications` delivers with backoff + `FOR UPDATE SKIP LOCKED`. |
| H5 | Cross-client isolation is enforced by ~12 hand-copied `if (role==='CLIENT' && x.client_id!==user.clientId)` checks. One omission = an IDOR. | ✅ centralized in `src/lib/scope.ts` (`assertClientAccess`/`clientScope`/`resolveClientId`), applied to the detail/mutation routes, 10 unit tests. Query-layer default-scoping still worth adding. |
| H6 | `db.ts` pool has **no `pool.on('error')` handler** → an idle-client network error takes down the Node process. No pruning of expired `sessions`. | ✅ pool error handler + expired-session pruning in the daily cron. |
| H7 | `submitEcf()` and WhatsApp `fetch` calls have **no timeout** → a hung provider hangs the request. | ✅ `AbortSignal.timeout()` on both, plus SMTP connection/socket timeouts. |

### MEDIUM

| # | Finding |
|---|---------|
| M1 | ✅ VOID now refused for paid or NCF-issued invoices; `POST /api/invoices/[id]/credit-note` issues an E34/B04 credit note (proportional subtotal/ITBIS split, full or partial, tracks `credited_amount`). |
| M2 | Uploaded files trust the client-supplied `file.type`; no magic-byte sniffing. Downloads are `attachment` + CSP so XSS risk is low, but validation should not rely on the client. |
| M3 | `/api/documents/[id]/download` does `Response.redirect(d.url)` for non-`local:` URLs. No INSERT path creates remote URLs yet, but the column allows them — validate scheme/host before ever redirecting (SSRF/open-redirect defense-in-depth). |
| M4 | ✅ `cron/daily` now routes every reminder through `notifyInAppOnce` (20h dedup window); due-soon emails are queued, not re-sent inline. |
| M5 | ✅ `updated_at` triggers on every table with the column (migration 0002). |
| M6 | ✅ `lib/health.ts` — explainable score from overdue invoices, urgent tickets, ticket frequency, SLA breaches, late projects, inactivity, payment timeliness, renewals; returns weighted `factors[]` with the *why*. `GET /api/clients/[id]/health`, recomputed nightly. |
| M7 | No pagination — every list route is a hard `LIMIT 250/500` and the client renders all rows. Won't scale past a few hundred records. |
| M8 | Money is JS `number` end to end. `calculateInvoice` now rounds every step; other paths (dashboard sums, `paid_amount`) rely on Postgres `numeric`, which is fine, but the boundary is inconsistent. |
| M9 | ✅ `ticketMessageSchema` caps `billableMinutes` at 24h. |
| M10 | `submitEcf` failure still leaves the invoice `ISSUED` with an allocated NCF (`ecf_status='FAILED'`). For real e-CF this is a business decision that must be made explicitly. |
| M11 | ✅ versioned migrations (`db/migrations/*.sql` + `scripts/migrate.mjs`, checksum-guarded, one-shot `migrate` compose service). |

### LOW

- Modal (`live-modal`) has no focus trap, `Esc` handler, or `aria-modal`; unicode-glyph "icons" have no accessible label; muted grey text (`#5f6b84` on `#05070d`) fails WCAG AA contrast.
- `LiveControl.tsx` is one ~60-line minified god-component (`Create` alone is ~90 lines) — hard to review or extend.
- Footer says "Preview UI / v0.1.0" in some places, `v1.0` in others; `package.json` is `1.0.0`.
- No favicon, `manifest`, `SECURITY.md`.
- `location.href` full-page reload for login/logout instead of the router.
- Loading state is a bare "Cargando…" string — no skeletons, empty states, toasts, or optimistic updates.
- `dateValue` rejects datetimes but `payments.paidAt` is handled as free text cast to `timestamptz` — inconsistent.
- Invoice PDF prints English weekday names ("Sun Sep 06") instead of `es-DO`; dead vertical space between the navy header band and the CLIENTE block.

### IMPROVEMENTS (product / architecture)

- Extract a real design system (Button, Input, Table, Modal, Drawer, Badge, KPI, EmptyState, Skeleton, Toast, CommandPalette…) and break up `LiveControl`.
- Storage abstraction (`DocumentStore` interface) so local disk can be swapped for S3/MinIO without touching the modules.
- Zod payload schemas at every route boundary (envelope done — see below).
- Structured logging with a request id; `/metrics`; readiness already added.
- Session cookie should rotate on privilege change; consider TOTP MFA for `SUPER_ADMIN`/`ADMIN`.

---

## 3. Product gap vs. the brief

| Brief section | State | Notes |
|---|---|---|
| CRM / clients / contacts | Partial | Clients + contacts CRUD, Client 360 read view. No lead capture, no tags UI, no activity timeline. |
| Leads & opportunities / pipeline | Partial | Opportunities table + weighted forecast number. No kanban, no stage automation, no per-deal activity. |
| Proposals / quotes | ✅ v1 | Schema, branded PDF, tokenised public accept/reject page (`/p/[token]`), one-tx conversion → project + opportunity WON + optional initial invoice. Milestone editor is minimal; no proposal versioning yet. |
| Projects & tasks | Partial | Projects + tasks + margin math. No team, no time tracking, no file tab, no milestones. |
| Recurring services | ✅ v1 | an asset with `auto_invoice=true` is billed each cycle by `/api/cron/recurring` — idempotent via a unique `(asset_id, period_start)` invoice, real NCF, client email. |
| Dominican billing / NCF / e-CF | Partial | Sequence allocation + NCF on issue + e-CF adapter stub + ✅ credit notes (E34/B04). No sequence-exhaustion alerts, no e-CF XML. |
| Invoice / proposal / receipt PDFs | Partial | ✅ invoice + ✅ proposal + ✅ credit-note PDFs (shared template, dd/mm/yyyy). No receipt / statement templates. WinAnsi fonts. |
| Payments / AR / aging | ✅ v1 | `/api/reports/ar` — aging buckets (current/1-30/31-60/61-90/90+), DSO, by-client prioritised list, CSV export; Cobros page shows it. No receipt PDF / automated dunning cadence yet. |
| Support / Help Desk / SLA | ✅ v1 | first-response + resolution targets (config `sla_v2`), pausable clock (WAITING_CLIENT), 50/75/90/100 % alerts + escalation via `/api/cron/sla`, breach flags, dashboard (compliance %, avg times). No CSAT. |
| Billable support → invoice | ✅ | `ticket_time_entries` + `/api/tickets/[id]/time`; `/api/support/unbilled` groups by client; `/api/support/invoice` rolls it into one invoice at the configured rate and stamps the entries (no double-billing). |
| Assets / infrastructure | Partial | Asset CRUD + days-to-renewal. No secret-manager references, no dependency graph. |
| Renewal Watch | **Missing** as a surface | Cron notifies; no 7/30/60/90 dashboard, no "revenue at risk". |
| Notifications center | **Missing** | Rows are written; no unified center, no per-user preferences. |
| Automation builder (WHEN/IF/DO) | **Missing** | `automation_rules` table exists; no engine, no UI. |
| Documents | Partial | Upload/download/delete with auth. No S3 abstraction, no versioning, weak type validation. |
| Client portal | Partial | `CLIENT` role sees scoped data + own pulse/health. Still needs its own shell (not the admin workspace) and polish. |
| Reports | 🔧 v1 | `/api/reports/revenue` (6-month billed vs collected, MRR/ARR, collection rate) + `/api/reports/ar` + support quality, all with CSV. Reportes page rebuilt. Missing: revenue-by-client, margin-by-project, sales cycle, renewals. |
| Executive dashboard / Pulse / Next Best Action | ✅ v1 | `lib/pulse.ts` + `GET /api/pulse` — prioritised feed (overdue invoices, SLA risk, renewals ≤14d, stale proposals, late projects, at-risk clients) with RD$ at stake, sorted by (priority, impact); shown on the dashboard, each item jumps to its module. |
| Global search (⌘K) | ✅ | `GET /api/search` across clients, contacts, projects, invoices/credit-notes, tickets, proposals, assets (CLIENT-scoped); ⌘K palette in the workspace with arrow-key nav. Jumps to the module (per-record deep-link is a follow-up). |
| Security (MFA, rate limiting, headers, audit UI) | Partial | Headers + login rate limiting added here. No MFA, no audit UI. |
| Audit log | Partial | Written for most mutations; no filterable UI, no diff view. |
| Migrations / backups / observability | **Missing** | See M11, H6. |

---

## 4. Sequenced roadmap

**Phase 0 — safety net (this pass) ✅**
Lockfile, dependency patch, CI (lint/test/build/audit), nonce CSP + security
headers, login rate limiting, same-origin write guard, readiness probe, DB pool
error handler, race-safe ticket/project numbering, Docker standalone + non-root,
env-driven compose, invoice-math extraction + tests, dead-code removal.
Deployed to `https://control.jfmcss.com` (Traefik + ACME).

**Phase 1 — foundations ✅**
✅ versioned migrations · ✅ standard API envelope (all routes + 5 frontend callers) ·
✅ Zod validation (`lib/schema` + `parseBody`, every mutation route) · ✅ `Origin` CSRF
check · ✅ pool error handler · ✅ race-safe ticket/project numbering · ✅ `updated_at`
triggers · ✅ outbound timeouts · ✅ centralized client-scope helper (`lib/scope`) +
tests · ✅ notification outbox (`/api/cron/notifications`, backoff, `FOR UPDATE SKIP
LOCKED`) + session pruning · ✅ DB-backed integration suite (fiscal concurrency,
recurring idempotency, proposal conversion, payment reconciliation) in CI.
Open: storage interface (S3/MinIO) · query-layer default-scoping.

**Phase 2 — revenue core (in progress)**
✅ Proposals (schema, PDF, tokenised public accept/reject, one-tx conversion →
project + opportunity WON + optional deposit invoice) · ✅ recurring services +
idempotent cycle billing · ✅ credit notes (E34/B04, full/partial, VOID hardening).
Open: receipt/statement PDFs · AR aging + collections cadence · billable-time → invoice.

**Phase 3 — service core (in progress)**
✅ SLA engine (first-response + resolution, pausable clock, 50/75/90/100 % alerts,
escalation, dashboard) · ✅ billable-time → invoice.
Open: CSAT · renewal-watch dashboard + revenue-at-risk · notification center + preferences · AR aging + collections.

**Phase 4 — intelligence & polish**
Explainable client health score · JFMCSS Pulse / Next Best Action · reports module
(CSV export) · global search · automation builder · audit UI · design-system
extraction + `LiveControl` breakup · accessibility pass · MFA for admins.

**Phase 5 — operations**
Structured logging + metrics · backup/restore runbook · deployment docs · load test.
