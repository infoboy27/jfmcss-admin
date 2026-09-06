-- Notification center: a per-user in-app inbox with categories, plus per-user
-- delivery preferences (mute a category, opt out of email/WhatsApp copies).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'SYSTEM';

-- Backfill a best-effort category from what the metadata already carries.
UPDATE notifications SET category = 'SUPPORT'
  WHERE category = 'SYSTEM' AND metadata ? 'ticketId';
UPDATE notifications SET category = 'BILLING'
  WHERE category = 'SYSTEM' AND (metadata ? 'invoiceId' OR channel = 'EMAIL');

-- Inbox read model: a user's unread IN_APP items, newest first.
CREATE INDEX IF NOT EXISTS notifications_inbox_idx
  ON notifications (user_id, created_at DESC)
  WHERE channel = 'IN_APP';

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled    boolean     NOT NULL DEFAULT true,
  whatsapp_enabled boolean     NOT NULL DEFAULT true,
  muted_categories jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
