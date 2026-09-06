-- Turn `notifications` into a delivery outbox: EMAIL/WHATSAPP rows are written
-- PENDING by request handlers and delivered out-of-band by the notification
-- cron, with bounded retries.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS attempts        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      text,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Drain query: PENDING external channels whose backoff has elapsed, oldest first.
CREATE INDEX IF NOT EXISTS notifications_outbox_idx
  ON notifications (next_attempt_at)
  WHERE status = 'PENDING' AND channel IN ('EMAIL', 'WHATSAPP');
