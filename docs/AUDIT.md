# JFMCSS Control — Technical Audit & Roadmap

_Audit date: 2026-09-06 · Reviewed commit: `cbf4801` · Auditor: engineering ownership pass_

This document is the single source of truth for the state of JFMCSS Control and
the plan to take it to production. It is updated as items are resolved.

---

## 1. Executive summary

_Started as a ~15 % prototype. After the ownership pass it is a **working
revenue-and-service operations core**, deployed at `https://control.jfmcss.com`._

**Done (Phase 0–5: collections, notification center, automation engine, CSAT,
audit UI, TOTP MFA, pagination, client-portal skin, structured logging +
Prometheus metrics, backup/restore + runbook — ~58 commits, CI green):**
security hardening (headers/CSP-nonce, login rate limit, Origin guard) ·
versioned migrations (advisory-locked runner) · standard API envelope + Zod on
every mutation route · centralized client-scope guard · notification outbox +
4 crons · **proposals** (PDF + public accept link + one-tx conversion) ·
**recurring services** · **credit notes** · **SLA engine** (pausable clock,
50/75/90/100 % alerts, escalation) · **billable time → invoice** · health score ·
JFMCSS Pulse · reports + renewal watch · global search · **AR aging + automated
dunning cadence** (payment-promise snooze) · **notification center** (categorised
inbox, per-user mutes) · **automation engine** (WHEN/IF/DO, notify/email/webhook,
SSRF-guarded, dry-run + run log) · **CSAT** (survey on resolve, public page,
low-score escalation) · **audit UI** · **TOTP MFA** (opt-in) · **offset pagination** ·
**client-portal skin** + a11y pass · **structured logging + Prometheus `/api/metrics`** ·
**backup/restore scripts + runbook** · magic-byte upload check · ~75 unit + ~25 integration tests.

**Still to build:** design-system extraction + a full `LiveControl` breakup (best done in a focused session with visual review — the file is only ~300 lines today so the ROI is modest). See §3–4.

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

The intelligence layer, security polish (MFA, audit UI, pagination) and the
operations pack (structured logging, Prometheus metrics wired into the 163
monitoring stack, backup/restore + runbook) are done. Remaining: a design-system
extraction + full `LiveControl` breakup (modest ROI at ~300 lines), off-box
backup sync, a storage abstraction (S3/MinIO) for uploads, a load test.

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
| M2 | ✅ `src/lib/filetype.ts` sniffs magic bytes on upload — a file whose first bytes don't match its declared MIME (PDF/PNG/JPEG/WEBP/DOCX/XLSX; `text/plain` = no NUL) is rejected 415. |
| M3 | `/api/documents/[id]/download` does `Response.redirect(d.url)` for non-`local:` URLs. No INSERT path creates remote URLs yet, but the column allows them — validate scheme/host before ever redirecting (SSRF/open-redirect defense-in-depth). |
| M4 | ✅ `cron/daily` now routes every reminder through `notifyInAppOnce` (20h dedup window); due-soon emails are queued, not re-sent inline. |
| M5 | ✅ `updated_at` triggers on every table with the column (migration 0002). |
| M6 | ✅ `lib/health.ts` — explainable score from overdue invoices, urgent tickets, ticket frequency, SLA breaches, late projects, inactivity, payment timeliness, renewals; returns weighted `factors[]` with the *why*. `GET /api/clients/[id]/health`, recomputed nightly. |
| M7 | ✅ Offset pagination (`?limit=&offset=`) on clients/invoices/tickets/payments/audit via `src/lib/pagination.ts`; envelope carries `{total,hasMore}`. Default page size kept at the old cap so nothing regressed; the Auditoría page uses load-more. UI "load more" for the other lists still pending. |
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
- ✅ Structured JSON logging (`src/lib/log.ts`) + `GET /api/metrics` (Prometheus, bearer `METRICS_TOKEN`, wired into the 163 monitoring stack). Readiness probe already present. A per-request id is still a nice-to-have.
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
| Payments / AR / aging / cobranza | ✅ | AR aging + DSO + by-client; `/api/reports/collections` per-invoice dunning state; **automated dunning** (configurable −3/+1/+7/+15-day cadence, one step per run, escalation to Finance) + payment-promise snooze. No receipt PDF yet. |
| Support / Help Desk / SLA | ✅ v1 | first-response + resolution targets (config `sla_v2`), pausable clock (WAITING_CLIENT), 50/75/90/100 % alerts + escalation via `/api/cron/sla`, breach flags, dashboard (compliance %, avg times). |
| CSAT | ✅ v1 | migration 0011 (`csat_token`/`score`/`comment`/`requested_at`/`submitted_at` on tickets). `requestCsat` on resolve emails the client `/csat/<token>` (unauthenticated page, 5-face picker + comment); `submitCsat` is one-shot (UPDATE-guarded), notifies assignee + support leads on score ≤ 2, emits `ticket.csat_received`. `csatSummary` — 90-day avg / response rate / distribution / recent comments, client-scoped — folded into `/api/support/metrics`, shown on Soporte + Reportes. |
| Billable support → invoice | ✅ | `ticket_time_entries` + `/api/tickets/[id]/time`; `/api/support/unbilled` groups by client; `/api/support/invoice` rolls it into one invoice at the configured rate and stamps the entries (no double-billing). |
| Assets / infrastructure | Partial | Asset CRUD + days-to-renewal. No secret-manager references, no dependency graph. |
| Renewal Watch | ✅ | `GET /api/reports/renewals` — 7/30/60/90-day windows with count + revenue, overdue count, revenue-at-risk; Servicios & activos page leads with it + CSV. |
| Notifications center | ✅ v1 | `notifications.category` + `notification_prefs` (migration 0009). `GET /api/notifications` returns `{notifications, unreadCount, unreadByCategory, prefs}` with `?filter=unread&category=&before=`; PATCH marks by `id`/`ids[]`/`{all,category}`. `/api/notifications/prefs` for per-user category mutes — a muted category is never written to that user's inbox (guarded in the INSERT). Comunicaciones page: filter chips with unread tallies, mark-all(-category), relative time, category dots, preferences modal; sidebar unread badge. Per-user email/WhatsApp opt-out is stored but not yet enforced (staff email paths don't map to a user). |
| Automation builder (WHEN/IF/DO) | ✅ v1 | `src/lib/automations.ts` — 7 domain events (invoice.created/paid, payment.received, ticket.created/resolved, proposal.accepted, client.created), flat-AND conditions with `{{field}}` templating, actions notify/email/webhook. Webhook SSRF guard resolves DNS and blocks private/loopback/link-local/CGNAT/metadata. `fireAutomations` wired at each emit point (fire-and-forget, never breaks the request). `automation_runs` execution log (migration 0010, pruned >60d by daily cron), shown on the page. API: GET returns `{automations, runs, catalog}`; POST validates via discriminated union; PATCH/DELETE `[id]`; `POST /api/automations/test` dry-runs an unsaved rule. Not yet: OR groups, `task`/field-set actions, scheduled/time-based triggers. |
| Documents | Partial | Upload/download/delete with auth. No S3 abstraction, no versioning, weak type validation. |
| Client portal | ✅ v1 | `CLIENT` role gets a portal skin of the same workspace — "PORTAL" branding, client-language nav ("Mis facturas", "Soporte", …), "Hola, <name>" resumen, "Abrir un caso" CTA, staff-only ⌘K palette hidden. Scoped data + own pulse/health as before. A fully separate shell/routing is deferred (low ROI over the skin). |
| Reports | 🔧 v1 | `/api/reports/revenue` (6-month billed vs collected, MRR/ARR, collection rate) + `/api/reports/ar` + support quality, all with CSV. Reportes page rebuilt. Missing: revenue-by-client, margin-by-project, sales cycle, renewals. |
| Executive dashboard / Pulse / Next Best Action | ✅ v1 | `lib/pulse.ts` + `GET /api/pulse` — prioritised feed (overdue invoices, SLA risk, renewals ≤14d, stale proposals, late projects, at-risk clients) with RD$ at stake, sorted by (priority, impact); shown on the dashboard, each item jumps to its module. |
| Global search (⌘K) | ✅ | `GET /api/search` across clients, contacts, projects, invoices/credit-notes, tickets, proposals, assets (CLIENT-scoped); ⌘K palette in the workspace with arrow-key nav. Jumps to the module (per-record deep-link is a follow-up). |
| Security (MFA, rate limiting, headers, audit UI) | ✅ v1 | Headers/CSP-nonce + login rate limiting + Origin guard. **TOTP MFA** (migration 0012, `src/lib/totp.ts`, opt-in per user, 2-step login, one-time backup codes, SUPER_ADMIN reset). **Auditoría page** — filters (entity/action/date/search), facets, pagination, before/after JSON drawer. |
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
✅ AR aging + collections cadence · ✅ billable-time → invoice. Open: receipt/statement PDFs.

**Phase 3 — service core (in progress)**
✅ SLA engine (first-response + resolution, pausable clock, 50/75/90/100 % alerts,
escalation, dashboard) · ✅ billable-time → invoice · ✅ renewal-watch dashboard +
revenue-at-risk · ✅ AR aging + automated dunning cadence (payment-promise snooze) ·
✅ notification center (categorised inbox, per-user category mutes) ·
✅ automation builder (WHEN/IF/DO: 8 events, notify/email/webhook, dry-run + run log) ·
✅ CSAT (survey on resolve, public page, low-score escalation, 90-day rollup) ·
✅ Auditoría page (filters + before/after drawer) · ✅ TOTP MFA (opt-in) · ✅ offset pagination · ✅ client-portal skin · ✅ a11y pass v1.

**Phase 4 — intelligence & polish**
✅ Explainable client health score · ✅ JFMCSS Pulse / Next Best Action · ✅ reports
module (CSV export) · ✅ global search · ✅ automation builder · ✅ audit UI ·
✅ MFA (TOTP, opt-in) · ✅ offset pagination · ✅ client-portal skin · ✅ accessibility pass v1 (dialog roles, Escape/click-out, aria-current, focus) · design-system extraction + full `LiveControl` breakup (deferred, low ROI).

**Phase 5 — operations**
✅ Structured logging + Prometheus `/api/metrics` (cron/outbox/AR/SLA/pool gauges) ·
✅ `ops/backup.sh` + `ops/restore.sh` (pg_dump -Fc + uploads tar, retention) ·
✅ `docs/RUNBOOK.md` (deploy, probes, alerts, incidents, restore drill).
Open: off-box backup sync (documented, needs a destination) · load test · a
per-request trace id · storage abstraction (S3/MinIO) for uploads.
