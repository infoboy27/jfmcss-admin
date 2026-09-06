-- Recurring services: an asset (hosting, licence, SaaS, maintenance retainer…)
-- with `auto_invoice` on is billed automatically each cycle. Idempotency comes
-- from a unique (asset_id, period_start) invoice — a double cron run is a no-op.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS auto_invoice        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_invoice_date   date,
  ADD COLUMN IF NOT EXISTS billed_through      date,
  ADD COLUMN IF NOT EXISTS fiscal_type         text NOT NULL DEFAULT 'E31',
  ADD COLUMN IF NOT EXISTS service_description text;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS asset_id     uuid REFERENCES assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end   date;

-- One invoice per service per billing period — the idempotency guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_recurring_period_idx
  ON invoices (asset_id, period_start)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assets_auto_invoice_idx
  ON assets (next_invoice_date)
  WHERE auto_invoice = true;
