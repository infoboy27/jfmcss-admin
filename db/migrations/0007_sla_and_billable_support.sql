-- SLA engine: separate first-response and resolution targets, a pausable clock
-- (stopped while WAITING_CLIENT), breach flags and threshold-alert bookkeeping.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sla_paused_at         timestamptz,
  ADD COLUMN IF NOT EXISTS sla_paused_seconds    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_response_breached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_breached     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_level      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sla_alerts            jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: existing tickets keep their old sla_due_at as the resolution target.
UPDATE tickets SET resolution_due_at = sla_due_at WHERE resolution_due_at IS NULL;

CREATE INDEX IF NOT EXISTS tickets_sla_open_idx
  ON tickets (resolution_due_at)
  WHERE status NOT IN ('RESOLVED', 'CLOSED');

-- Richer SLA config (hours). Old shape { "URGENT": 2, ... } stays valid and is
-- read as the resolution target with a derived first-response target.
INSERT INTO settings(key, value) VALUES
  ('sla_v2', '{
     "LOW":    {"firstResponse": 8,   "resolution": 48},
     "MEDIUM": {"firstResponse": 4,   "resolution": 24},
     "HIGH":   {"firstResponse": 1,   "resolution": 8},
     "URGENT": {"firstResponse": 0.25,"resolution": 4}
   }'::jsonb),
  ('support', '{"hourlyRate": 2500, "currency": "DOP", "roundToMinutes": 15}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Billable support: one row per logged work session. `tickets.billable_minutes`
-- stays as a cached sum for list views.
CREATE TABLE IF NOT EXISTS ticket_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  minutes    integer NOT NULL CHECK (minutes > 0),
  description text,
  billable   boolean NOT NULL DEFAULT true,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  logged_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entries_ticket_idx ON ticket_time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS time_entries_unbilled_idx
  ON ticket_time_entries(ticket_id) WHERE billable = true AND invoice_id IS NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source text; -- 'MANUAL' | 'RECURRING' | 'PROPOSAL' | 'SUPPORT'
