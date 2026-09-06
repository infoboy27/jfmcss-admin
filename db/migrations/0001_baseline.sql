CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('SUPER_ADMIN','ADMIN','FINANCE','PM','SUPPORT','CLIENT')),
  active boolean NOT NULL DEFAULT true,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_exp_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  legal_name text,
  tax_id text,
  tax_id_type text NOT NULL DEFAULT 'RNC',
  email text,
  phone text,
  website text,
  address text,
  city text,
  country text NOT NULL DEFAULT 'República Dominicana',
  payment_terms_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('LEAD','ACTIVE','PAUSED','INACTIVE')),
  health_score integer NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  notes text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_client_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'QUALIFIED' CHECK (stage IN ('LEAD','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 25 CHECK (probability BETWEEN 0 AND 100),
  expected_close date,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  next_action text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code text UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  budget numeric(14,2) NOT NULL DEFAULT 0,
  internal_cost numeric(14,2) NOT NULL DEFAULT 0,
  recurring_revenue numeric(14,2) NOT NULL DEFAULT 0,
  start_date date,
  due_date date,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  repository_url text,
  production_url text,
  environment jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','BLOCKED','DONE')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL UNIQUE,
  prefix text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  max_number bigint,
  expires_at date,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fiscal_sequences(document_type,prefix,next_number)
VALUES ('E31','E31',1),('E32','E32',1),('B01','B01',1),('B02','B02',1)
ON CONFLICT (document_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE,
  fiscal_type text NOT NULL DEFAULT 'E31',
  ncf text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIAL','PAID','OVERDUE','VOID')),
  currency text NOT NULL DEFAULT 'DOP',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  ecf_status text NOT NULL DEFAULT 'NOT_SUBMITTED',
  ecf_track_id text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices(client_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices(due_date);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 18,
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'DOP',
  method text NOT NULL DEFAULT 'TRANSFER',
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_CLIENT','RESOLVED','CLOSED')),
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  category text NOT NULL DEFAULT 'GENERAL',
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_email text,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  billable_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status);
CREATE INDEX IF NOT EXISTS tickets_sla_idx ON tickets(sla_due_at);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('DOMAIN','SSL','CLOUD','SERVER','LICENSE','SAAS','OTHER')),
  name text NOT NULL,
  provider text,
  external_id text,
  renewal_date date,
  recurring_cost numeric(14,2) NOT NULL DEFAULT 0,
  recurring_price numeric(14,2) NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'MONTHLY',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','AT_RISK','EXPIRED','CANCELLED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_renewal_idx ON assets(renewal_date);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP')),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','READ')),
  destination text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_type,entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings(key,value) VALUES
('company', '{"name":"JFMCSS","country":"DO","currency":"DOP","itbisRate":18}'::jsonb),
('sla', '{"LOW":48,"MEDIUM":24,"HIGH":8,"URGENT":2}'::jsonb)
ON CONFLICT (key) DO NOTHING;
