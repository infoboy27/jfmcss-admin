-- Credit notes: a fiscal document that reverses all or part of an issued
-- invoice. Stored in `invoices` (same fields, same numbering) distinguished by
-- `document_kind`, and linked to the invoice it corrects.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_kind        text NOT NULL DEFAULT 'INVOICE'
    CHECK (document_kind IN ('INVOICE', 'CREDIT_NOTE')),
  ADD COLUMN IF NOT EXISTS references_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credited_amount       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason                text;

CREATE INDEX IF NOT EXISTS invoices_references_idx ON invoices(references_invoice_id)
  WHERE references_invoice_id IS NOT NULL;

-- Fiscal sequences for credit notes: E34 (e-CF) and B04 (pre-printed).
INSERT INTO fiscal_sequences(document_type, prefix, next_number)
VALUES ('E34', 'E34', 1), ('B04', 'B04', 1)
ON CONFLICT (document_type) DO NOTHING;
