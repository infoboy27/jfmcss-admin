# JFMCSS Control — Technical Audit & Roadmap

_Audit date: 2026-09-06 · Reviewed commit: `cbf4801` · Auditor: engineering ownership pass_

This document is the single source of truth for the state of JFMCSS Control and
the plan to take it to production. It is updated as items are resolved.

---

## 1. Executive summary

JFMCSS Control today is a **well-structured MVP**, not the operations OS described
in the product brief. Roughly **15–20%** of the target scope exists.

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

What it is not yet:

- No proposals/quotes, no recurring-service billing, no automation builder, no
  reports module, no real health score, no "JFMCSS Pulse", no renewal-watch
  dashboard, no notification center, no global search, no MFA, no credit notes.
- No automated tests for the money- and access-critical paths.
- No versioned migrations, no CSRF defense, notifications block the request
  thread, several number generators still race.
- `AdminApp.tsx` was a dead hardcoded mock (removed).

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
| H2 | **No automated tests** for authentication, RBAC, cross-client isolation, invoice math, NCF concurrency, payment reconciliation, recurring-invoice idempotency, SLA, file authorization, proposal conversion — the exact list the brief calls out. | 🔧 unit tests added for invoice math / rate limiter / validators; integration suite still to build. |
| H3 | `nextHumanNumber()` (tickets, projects) reads `MAX(number)` then `+1` with **no lock/transaction** → concurrent creation collides on the unique index. Invoice numbering was fixed; these were not. | ✅ takes a transaction advisory lock; ticket/project creation runs allocation + insert in one `tx()`. |
| H4 | Notifications (`sendEmail`, `sendWhatsApp`) are **awaited inside the request handler** — a slow SMTP host stalls invoice/payment/ticket responses. | ⬜ move to a queue/outbox drained by the cron worker; keep in-app notification synchronous. |
| H5 | Cross-client isolation is enforced by ~12 hand-copied `if (role==='CLIENT' && x.client_id!==user.clientId)` checks. One omission = an IDOR. | ⬜ centralize into a query-layer scope helper + isolation tests (see H2). |
| H6 | `db.ts` pool has **no `pool.on('error')` handler** → an idle-client network error takes down the Node process. No pruning of expired `sessions`. | 🔧 pool error handler added; session pruning in the daily cron still open. |
| H7 | `submitEcf()` and WhatsApp `fetch` calls have **no timeout** → a hung provider hangs the request. | ⬜ wrap in `AbortSignal.timeout()`. |

### MEDIUM

| # | Finding |
|---|---------|
| M1 | `/api/invoices/[id]` `VOID` does not check the invoice isn't already `PAID`/settled, and there is **no credit-note flow** — voiding an issued fiscal document is not how DGII expects corrections to be handled. |
| M2 | Uploaded files trust the client-supplied `file.type`; no magic-byte sniffing. Downloads are `attachment` + CSP so XSS risk is low, but validation should not rely on the client. |
| M3 | `/api/documents/[id]/download` does `Response.redirect(d.url)` for non-`local:` URLs. No INSERT path creates remote URLs yet, but the column allows them — validate scheme/host before ever redirecting (SSRF/open-redirect defense-in-depth). |
| M4 | `cron/daily` notification inserts are **not idempotent** — a second run the same day re-sends "invoice overdue"/"renewal due" emails. Only the `OVERDUE` status UPDATE is safe to repeat. |
| M5 | No `updated_at` triggers; the column is only maintained where a handler remembers to set it. |
| M6 | `health_score` is a static column (default 100), never computed. The brief wants an explainable algorithm. |
| M7 | No pagination — every list route is a hard `LIMIT 250/500` and the client renders all rows. Won't scale past a few hundred records. |
| M8 | Money is JS `number` end to end. `calculateInvoice` now rounds every step; other paths (dashboard sums, `paid_amount`) rely on Postgres `numeric`, which is fine, but the boundary is inconsistent. |
| M9 | `ticket_messages` POST accepts unbounded `billableMinutes`; no validation/cap. |
| M10 | `submitEcf` failure still leaves the invoice `ISSUED` with an allocated NCF (`ecf_status='FAILED'`). For real e-CF this is a business decision that must be made explicitly. |
| M11 | No migrations. `db/init.sql` is `CREATE … IF NOT EXISTS`; schema evolution will be ad hoc `ALTER`s. |

### LOW

- Modal (`live-modal`) has no focus trap, `Esc` handler, or `aria-modal`; unicode-glyph "icons" have no accessible label; muted grey text (`#5f6b84` on `#05070d`) fails WCAG AA contrast.
- `LiveControl.tsx` is one ~60-line minified god-component (`Create` alone is ~90 lines) — hard to review or extend.
- Footer says "Preview UI / v0.1.0" in some places, `v1.0` in others; `package.json` is `1.0.0`.
- No favicon, `manifest`, `SECURITY.md`.
- `location.href` full-page reload for login/logout instead of the router.
- Loading state is a bare "Cargando…" string — no skeletons, empty states, toasts, or optimistic updates.
- `dateValue` rejects datetimes but `payments.paidAt` is handled as free text cast to `timestamptz` — inconsistent.

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
| Proposals / quotes | **Missing** | No table, no PDF, no accept/reject link, no conversion to project/invoice. |
| Projects & tasks | Partial | Projects + tasks + margin math. No team, no time tracking, no file tab, no milestones. |
| Recurring services | **Missing** | `assets.billing_cycle` exists but nothing generates invoices from it. |
| Dominican billing / NCF / e-CF | Partial | Sequence allocation + NCF on issue + e-CF adapter stub. No credit notes, no sequence-exhaustion alerts, no e-CF XML. |
| Invoice / proposal / receipt PDFs | Partial | Invoice PDF only, single-page, WinAnsi fonts. No receipt / credit note / statement templates. |
| Payments / AR / aging | Partial | Payment registration + balance recompute. No aging report, no collections cadence, no receipt PDF. |
| Support / Help Desk / SLA | Partial | Tickets + threads + `sla_due_at` + billable minutes. No first-response SLA, no 50/75/90/100% alerts, no escalation, no CSAT. |
| Billable support → invoice | **Missing** | Minutes are recorded; nothing rolls them into an invoice. |
| Assets / infrastructure | Partial | Asset CRUD + days-to-renewal. No secret-manager references, no dependency graph. |
| Renewal Watch | **Missing** as a surface | Cron notifies; no 7/30/60/90 dashboard, no "revenue at risk". |
| Notifications center | **Missing** | Rows are written; no unified center, no per-user preferences. |
| Automation builder (WHEN/IF/DO) | **Missing** | `automation_rules` table exists; no engine, no UI. |
| Documents | Partial | Upload/download/delete with auth. No S3 abstraction, no versioning, weak type validation. |
| Client portal | Partial | `CLIENT` role sees scoped data. Needs its own shell, polish, and isolation tests. |
| Reports | **Missing** | No module. |
| Executive dashboard / Pulse / Next Best Action | **Missing** | Dashboard shows 8 KPIs; no prioritized action feed. |
| Global search (Cmd-K) | **Missing** | Was only in the deleted mock. |
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

**Phase 1 — foundations**
✅ versioned migrations · ✅ standard API envelope (`{data}` / `{error:{code,message}}`,
`ok()`/`fail()` in `lib/http`, all 30 routes + 5 frontend callers) · ✅ `Origin` CSRF check ·
✅ pool error handler · ✅ lock ticket/project numbering · ✅ `updated_at` triggers ·
✅ outbound timeouts · 🔧 Zod validation (`lib/schema` + `parseBody`, wired into invoice
& payment routes; remaining routes pending).
Open: Zod on the rest of the routes · centralized client-scope helper + isolation test
suite · notification outbox (async) + session pruning · storage interface.

**Phase 2 — revenue core**
Proposals (schema, PDF, secure accept/reject link, convert → opportunity WON →
project → optional deposit invoice) · recurring services + idempotent monthly
invoice generation · credit notes · receipt/statement PDFs · AR aging + collections.

**Phase 3 — service core**
SLA engine (first-response + resolution targets, 50/75/90/100 % alerts,
escalation) · billable-time → invoice · CSAT · renewal-watch dashboard +
revenue-at-risk · notification center + preferences.

**Phase 4 — intelligence & polish**
Explainable client health score · JFMCSS Pulse / Next Best Action · reports module
(CSV export) · global search · automation builder · audit UI · design-system
extraction + `LiveControl` breakup · accessibility pass · MFA for admins.

**Phase 5 — operations**
Structured logging + metrics · backup/restore runbook · deployment docs · load test.
