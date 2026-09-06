-- Automated collections cadence (dunning). Each open invoice runs through a
-- configurable sequence of reminders relative to its due date; every step fires
-- at most once (tracked in dunning_log), a payment promise snoozes the sequence.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dunning_log   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS promise_date  date,
  ADD COLUMN IF NOT EXISTS promise_note  text;

CREATE INDEX IF NOT EXISTS invoices_dunning_idx
  ON invoices (due_date)
  WHERE document_kind = 'INVOICE' AND status IN ('ISSUED', 'PARTIAL', 'OVERDUE');

-- Default cadence: a preventive nudge 3 days before due, a reminder the day
-- after, and an internal escalation a week overdue.
INSERT INTO settings(key, value) VALUES ('dunning', '{
  "enabled": true,
  "minBalance": 0,
  "promiseGraceDays": 2,
  "steps": [
    { "key": "preventive",  "offset": -3, "channels": ["email"],           "label": "Recordatorio preventivo" },
    { "key": "first",       "offset": 1,  "channels": ["email"],           "label": "Primer aviso de vencimiento" },
    { "key": "second",      "offset": 7,  "channels": ["email", "inapp"],  "label": "Segundo aviso" },
    { "key": "escalation",  "offset": 15, "channels": ["inapp"],           "label": "Escalación interna" }
  ]
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
