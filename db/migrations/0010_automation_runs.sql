-- Automation engine: an execution log for the WHEN/IF/DO rules in
-- automation_rules. One row per rule that matched a fired event, holding the
-- per-action result — this is what the Automatizaciones page shows as history.

CREATE TABLE IF NOT EXISTS automation_runs (
  id         bigserial PRIMARY KEY,
  rule_id    uuid REFERENCES automation_rules(id) ON DELETE CASCADE,
  event      text NOT NULL,
  matched    boolean NOT NULL DEFAULT true,
  status     text NOT NULL DEFAULT 'OK' CHECK (status IN ('OK','ERROR')),
  result     jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_recent_idx ON automation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_rule_idx   ON automation_runs (rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_rules_event_idx ON automation_rules (event) WHERE enabled;
