-- Proposals / quotes: the step between an opportunity and a project.
-- A proposal is drafted with line items + payment milestones, sent to the
-- client as a tokenised link, and on acceptance converts to a project (and,
-- optionally, an initial invoice).

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED')),
  currency text NOT NULL DEFAULT 'DOP',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  valid_until date,
  payment_terms text,
  terms text,
  notes text,
  public_token text UNIQUE,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  decided_note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_client_idx ON proposals(client_id);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals(status);

CREATE TABLE IF NOT EXISTS proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 18,
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

-- Payment schedule: "50% al inicio / 50% a la entrega" etc.
CREATE TABLE IF NOT EXISTS proposal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  label text NOT NULL,
  percentage numeric(6,3),
  amount numeric(14,2),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON proposals;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link an invoice back to the proposal it was generated from.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL;
