-- CSAT: a one-question satisfaction survey sent to the client when a ticket is
-- resolved. The token backs an unauthenticated /csat/<token> page; the score is
-- 1-5 and can only be submitted once.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS csat_token        text,
  ADD COLUMN IF NOT EXISTS csat_score        integer,
  ADD COLUMN IF NOT EXISTS csat_comment      text,
  ADD COLUMN IF NOT EXISTS csat_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS csat_submitted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_csat_score_range') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_csat_score_range
      CHECK (csat_score IS NULL OR csat_score BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_csat_token_key ON tickets (csat_token) WHERE csat_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_csat_submitted_idx ON tickets (csat_submitted_at DESC) WHERE csat_score IS NOT NULL;
