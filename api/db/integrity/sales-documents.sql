-- Sales document integrity: once a document leaves draft its number, issue instant, identity snapshots,
-- dates and amounts are frozen; only lifecycle fields (status and its timestamps, versions, template and
-- appearance chosen at PDF regeneration, detached live references) may still change. Draft editing and the
-- draft -> issued transition are unrestricted. Numbering counters only ever advance by one.
-- Cancelled is terminal (status and cancellation fields freeze) and status never goes back to draft.
-- Numbered documents (credit notes included, and every payment and counter) cannot be deleted, so numbers stay gap-free, unless the
-- transaction-local flag app.sales_teardown = 'on' is set. Product code never sets it: it is reserved for a
-- future organization teardown routine and for privileged test fixtures that purge data.
CREATE FUNCTION sales_teardown_enabled() RETURNS boolean LANGUAGE sql
SET search_path = pg_catalog, pg_temp AS $$ SELECT coalesce(current_setting('app.sales_teardown', true), '') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION reject_issued_document_change_field(field text) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Issued documents are immutable: % cannot change', field USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_document_status(old_status text, new_status text, old_cancelled_at timestamptz, new_cancelled_at timestamptz, old_reason text, new_reason text) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF old_status = 'cancelled' AND (new_status IS DISTINCT FROM 'cancelled' OR new_cancelled_at IS DISTINCT FROM old_cancelled_at OR new_reason IS DISTINCT FROM old_reason) THEN
    PERFORM "public".reject_issued_document_change_field('cancelled state');
  END IF;
  IF new_status = 'draft' THEN PERFORM "public".reject_issued_document_change_field('status'); END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_issued_invoice() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  PERFORM "public".guard_document_status(OLD.status, NEW.status, OLD.cancelled_at, NEW.cancelled_at, OLD.cancellation_reason, NEW.cancellation_reason);
  IF OLD.status = 'sent' AND NEW.status = 'issued' THEN PERFORM "public".reject_issued_document_change_field('status'); END IF;
  -- An invoice corrected by an issued credit note stays on the books: it can no longer be cancelled.
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled'
     AND EXISTS (SELECT 1 FROM "public".credit_notes WHERE invoice_id = OLD.id AND status = 'issued') THEN
    RAISE EXCEPTION 'Invoices with issued credit notes cannot be cancelled' USING ERRCODE = '23514';
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number THEN PERFORM "public".reject_issued_document_change_field('number'); END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN PERFORM "public".reject_issued_document_change_field('kind'); END IF;
  IF NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN PERFORM "public".reject_issued_document_change_field('issued_at'); END IF;
  IF NEW.issue_date IS DISTINCT FROM OLD.issue_date THEN PERFORM "public".reject_issued_document_change_field('issue_date'); END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN PERFORM "public".reject_issued_document_change_field('due_date'); END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN PERFORM "public".reject_issued_document_change_field('currency'); END IF;
  IF NEW.locale IS DISTINCT FROM OLD.locale THEN PERFORM "public".reject_issued_document_change_field('locale'); END IF;
  IF NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot THEN PERFORM "public".reject_issued_document_change_field('issuer_snapshot'); END IF;
  IF NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot THEN PERFORM "public".reject_issued_document_change_field('client_snapshot'); END IF;
  IF NEW.bank_details_snapshot IS DISTINCT FROM OLD.bank_details_snapshot THEN PERFORM "public".reject_issued_document_change_field('bank_details_snapshot'); END IF;
  IF NEW.agreed_payment_method IS DISTINCT FROM OLD.agreed_payment_method THEN PERFORM "public".reject_issued_document_change_field('agreed_payment_method'); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN PERFORM "public".reject_issued_document_change_field('notes'); END IF;
  IF NEW.payment_terms IS DISTINCT FROM OLD.payment_terms THEN PERFORM "public".reject_issued_document_change_field('payment_terms'); END IF;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_total IS DISTINCT FROM OLD.tax_total OR NEW.total IS DISTINCT FROM OLD.total THEN
    PERFORM "public".reject_issued_document_change_field('amounts');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_issued_estimate() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  PERFORM "public".guard_document_status(OLD.status, NEW.status, OLD.cancelled_at, NEW.cancelled_at, OLD.cancellation_reason, NEW.cancellation_reason);
  IF (OLD.status = 'sent' AND NEW.status = 'issued')
     OR (OLD.status IN ('accepted','rejected','expired','superseded') AND NEW.status IN ('issued','sent')) THEN
    PERFORM "public".reject_issued_document_change_field('status');
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number THEN PERFORM "public".reject_issued_document_change_field('number'); END IF;
  IF NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN PERFORM "public".reject_issued_document_change_field('issued_at'); END IF;
  IF NEW.issue_date IS DISTINCT FROM OLD.issue_date THEN PERFORM "public".reject_issued_document_change_field('issue_date'); END IF;
  IF NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN PERFORM "public".reject_issued_document_change_field('valid_until'); END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN PERFORM "public".reject_issued_document_change_field('currency'); END IF;
  IF NEW.locale IS DISTINCT FROM OLD.locale THEN PERFORM "public".reject_issued_document_change_field('locale'); END IF;
  IF NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot THEN PERFORM "public".reject_issued_document_change_field('issuer_snapshot'); END IF;
  IF NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot THEN PERFORM "public".reject_issued_document_change_field('client_snapshot'); END IF;
  IF NEW.bank_details_snapshot IS DISTINCT FROM OLD.bank_details_snapshot THEN PERFORM "public".reject_issued_document_change_field('bank_details_snapshot'); END IF;
  IF NEW.agreed_payment_method IS DISTINCT FROM OLD.agreed_payment_method THEN PERFORM "public".reject_issued_document_change_field('agreed_payment_method'); END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN PERFORM "public".reject_issued_document_change_field('notes'); END IF;
  IF NEW.payment_terms IS DISTINCT FROM OLD.payment_terms THEN PERFORM "public".reject_issued_document_change_field('payment_terms'); END IF;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_total IS DISTINCT FROM OLD.tax_total OR NEW.total IS DISTINCT FROM OLD.total THEN
    PERFORM "public".reject_issued_document_change_field('amounts');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_issued_delivery_note() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  PERFORM "public".guard_document_status(OLD.status, NEW.status, NULL, NULL, OLD.cancellation_reason, NEW.cancellation_reason);
  IF NEW.number IS DISTINCT FROM OLD.number THEN PERFORM "public".reject_issued_document_change_field('number'); END IF;
  IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN PERFORM "public".reject_issued_document_change_field('delivered_at'); END IF;
  IF NEW.delivery_date IS DISTINCT FROM OLD.delivery_date THEN PERFORM "public".reject_issued_document_change_field('delivery_date'); END IF;
  IF NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot THEN PERFORM "public".reject_issued_document_change_field('issuer_snapshot'); END IF;
  IF NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot THEN PERFORM "public".reject_issued_document_change_field('client_snapshot'); END IF;
  IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address THEN PERFORM "public".reject_issued_document_change_field('delivery_address'); END IF;
  IF NEW.instructions IS DISTINCT FROM OLD.instructions THEN PERFORM "public".reject_issued_document_change_field('instructions'); END IF;
  IF NEW.include_reception_signature IS DISTINCT FROM OLD.include_reception_signature THEN PERFORM "public".reject_issued_document_change_field('include_reception_signature'); END IF;
  IF NEW.received_by_name IS DISTINCT FROM OLD.received_by_name THEN PERFORM "public".reject_issued_document_change_field('received_by_name'); END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- A payment has a number from insert: identity, amount and the receipt snapshot (except the chosen
-- design) are frozen immediately. The receipt snapshot and bank snapshot may be filled once when null.
CREATE FUNCTION guard_payment() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE parent record; reserved numeric;
BEGIN
  -- Invoice first for balance decisions. Existing payments may exceed net after a later credit;
  -- only recording/restoring/confirming a payment consumes availability again.
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT status, total INTO parent FROM "public".invoices WHERE id=NEW.invoice_id FOR UPDATE;
    IF NEW.status IN ('pending','confirmed') THEN
      IF parent.status IS NULL OR parent.status NOT IN ('issued','sent') THEN
        RAISE EXCEPTION 'Invoice is not payable' USING ERRCODE='23514';
      END IF;
      SELECT coalesce(sum(amount),0) INTO reserved FROM "public".payments
        WHERE invoice_id=NEW.invoice_id AND id<>NEW.id AND status IN ('pending','confirmed');
      IF reserved + NEW.amount > parent.total - "public".invoice_credited_total(NEW.invoice_id) THEN
        RAISE EXCEPTION 'Payment exceeds the available invoice balance' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.number IS DISTINCT FROM OLD.number THEN PERFORM "public".reject_issued_document_change_field('number'); END IF;
  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.creation_request IS DISTINCT FROM OLD.creation_request THEN
    PERFORM "public".reject_issued_document_change_field('operation');
  END IF;
  IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN PERFORM "public".reject_issued_document_change_field('invoice_id'); END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    PERFORM "public".reject_issued_document_change_field('amount');
  END IF;
  IF NEW.method IS DISTINCT FROM OLD.method OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
     OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.cheque_bank IS DISTINCT FROM OLD.cheque_bank
     OR NEW.cheque_number IS DISTINCT FROM OLD.cheque_number THEN
    PERFORM "public".reject_issued_document_change_field('payment details');
  END IF;
  IF OLD.bank_account_snapshot IS NOT NULL AND NEW.bank_account_snapshot IS DISTINCT FROM OLD.bank_account_snapshot THEN
    PERFORM "public".reject_issued_document_change_field('bank_account_snapshot');
  END IF;
  IF OLD.receipt_snapshot IS NOT NULL AND
     (NEW.receipt_snapshot IS NULL OR (NEW.receipt_snapshot - ARRAY['appearance','templateId']) IS DISTINCT FROM (OLD.receipt_snapshot - ARRAY['appearance','templateId'])) THEN
    PERFORM "public".reject_issued_document_change_field('receipt_snapshot');
  END IF;
  IF OLD.receipt_issued_at IS NOT NULL AND NEW.receipt_issued_at IS DISTINCT FROM OLD.receipt_issued_at THEN
    PERFORM "public".reject_issued_document_change_field('receipt_issued_at');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoices_issued_guard BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_issued_invoice();
--> statement-breakpoint
CREATE TRIGGER estimates_issued_guard BEFORE UPDATE ON estimates FOR EACH ROW EXECUTE FUNCTION guard_issued_estimate();
--> statement-breakpoint
CREATE TRIGGER delivery_notes_issued_guard BEFORE UPDATE ON delivery_notes FOR EACH ROW EXECUTE FUNCTION guard_issued_delivery_note();
--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment();
--> statement-breakpoint
-- Lines of a document that left draft cannot be inserted, changed or deleted, except that live catalogue
-- references (product, variant) may be cleared. A missing parent (cascade of a deleted document) is allowed.
CREATE FUNCTION guard_issued_document_lines() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE parent_id uuid; parent_status text; reference_columns text[] := ARRAY['product_id','product_variant_id','updated_at','updated_by_actor_id'];
BEGIN
  parent_id := (to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END) ->> TG_ARGV[0])::uuid;
  EXECUTE format('SELECT status FROM "public".%I WHERE id = $1', TG_ARGV[1]) INTO parent_status USING parent_id;
  IF parent_status IS NULL OR parent_status = 'draft' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - reference_columns) = (to_jsonb(OLD) - reference_columns) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Issued documents are immutable: lines cannot change' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_issued_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines FOR EACH ROW EXECUTE FUNCTION guard_issued_document_lines('invoice_id', 'invoices');
--> statement-breakpoint
CREATE TRIGGER estimate_lines_issued_guard BEFORE INSERT OR UPDATE OR DELETE ON estimate_lines FOR EACH ROW EXECUTE FUNCTION guard_issued_document_lines('estimate_id', 'estimates');
--> statement-breakpoint
CREATE TRIGGER delivery_note_lines_issued_guard BEFORE INSERT OR UPDATE OR DELETE ON delivery_note_lines FOR EACH ROW EXECUTE FUNCTION guard_issued_document_lines('delivery_note_id', 'delivery_notes');
--> statement-breakpoint
-- A numbering counter only advances by exactly one and is never removed, so numbers stay gap-free.
CREATE FUNCTION guard_document_number_counter() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF "public".sales_teardown_enabled() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Numbering counters cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.series <> OLD.series OR NEW.year <> OLD.year OR NEW.last <> OLD.last + 1 THEN
    RAISE EXCEPTION 'Numbering counters only advance by one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_number_counters_guard BEFORE UPDATE OR DELETE ON document_number_counters FOR EACH ROW EXECUTE FUNCTION guard_document_number_counter();
--> statement-breakpoint
-- Deleting a numbered document would leave a gap in its series: cancel it instead. Drafts (no number) can be
-- deleted. Payments are numbered at insert and are never deleted. Only a teardown (flag above) may delete.
CREATE FUNCTION guard_numbered_document_delete() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF (TG_TABLE_NAME = 'payments' OR OLD.number IS NOT NULL) AND NOT "public".sales_teardown_enabled() THEN
    RAISE EXCEPTION 'Numbered documents cannot be deleted: cancel them instead' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoices_delete_guard BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_numbered_document_delete();
--> statement-breakpoint
CREATE TRIGGER estimates_delete_guard BEFORE DELETE ON estimates FOR EACH ROW EXECUTE FUNCTION guard_numbered_document_delete();
--> statement-breakpoint
CREATE TRIGGER delivery_notes_delete_guard BEFORE DELETE ON delivery_notes FOR EACH ROW EXECUTE FUNCTION guard_numbered_document_delete();
--> statement-breakpoint
CREATE TRIGGER payments_delete_guard BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION guard_numbered_document_delete();
--> statement-breakpoint
-- Credit notes (avoirs). Rows are inserted as drafts; the draft -> issued transition re-checks, under a per-invoice
-- lock, that the credited invoice is still issued or sent, that the header equals the sum of its lines, and that the
-- issued credit notes of the invoice never exceed it (HT, VAT and TTC overall, and quantity, HT and VAT per line).
-- After issue only presentation fields (template, appearance, versions, audit columns) may change; the note
-- cannot be cancelled or deleted (number, delete guard below).
CREATE FUNCTION guard_credit_note_insert() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE parent record;
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'Credit notes are created as drafts and issued afterwards' USING ERRCODE = '23514';
  END IF;
  SELECT status, kind, currency, number, issue_date INTO parent FROM "public".invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF parent.status IS NULL OR parent.status NOT IN ('issued','sent') THEN
    RAISE EXCEPTION 'Only issued or sent invoices can be credited' USING ERRCODE = '23514';
  END IF;
  IF parent.kind IS DISTINCT FROM NEW.kind OR parent.currency <> NEW.currency OR parent.number <> NEW.invoice_number THEN
    RAISE EXCEPTION 'A credit note must match the kind, currency and number of its invoice' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION guard_issued_credit_note() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE invoice record; lines record; breached record;
BEGIN
  IF OLD.status = 'draft' THEN
    IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      PERFORM "public".reject_issued_document_change_field('invoice reference');
    END IF;
    IF NEW.status = 'issued' THEN
      SELECT status, subtotal, tax_total, total INTO invoice FROM "public".invoices WHERE id = OLD.invoice_id FOR UPDATE;
      IF invoice.status IS NULL OR invoice.status NOT IN ('issued','sent') THEN
        RAISE EXCEPTION 'Only issued or sent invoices can be credited' USING ERRCODE = '23514';
      END IF;
      SELECT count(*) AS n, coalesce(sum(net_amount),0) AS net, coalesce(sum(tax_amount),0) AS tax, coalesce(sum(total_amount),0) AS total
        INTO lines FROM "public".credit_note_lines WHERE credit_note_id = OLD.id;
      IF lines.n = 0 OR lines.net <> NEW.subtotal OR lines.tax <> NEW.tax_total OR lines.total <> NEW.total THEN
        RAISE EXCEPTION 'The credit note totals must equal the sum of its lines' USING ERRCODE = '23514';
      END IF;
      SELECT coalesce(sum(subtotal),0) AS net, coalesce(sum(tax_total),0) AS tax, coalesce(sum(total),0) AS total
        INTO breached FROM "public".credit_notes WHERE invoice_id = OLD.invoice_id AND status = 'issued' AND id <> OLD.id;
      IF breached.net + NEW.subtotal > invoice.subtotal OR breached.tax + NEW.tax_total > invoice.tax_total OR breached.total + NEW.total > invoice.total THEN
        RAISE EXCEPTION 'Credit notes cannot exceed the credited invoice' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "public".invoice_lines il
        JOIN "public".credit_note_lines mine ON mine.invoice_line_id = il.id AND mine.credit_note_id = OLD.id
        WHERE (SELECT coalesce(sum(c.quantity),0) FROM "public".credit_note_lines c JOIN "public".credit_notes n ON n.id = c.credit_note_id
               WHERE c.invoice_line_id = il.id AND (n.status = 'issued' OR n.id = OLD.id)) > il.quantity
           OR (SELECT coalesce(sum(c.net_amount),0) FROM "public".credit_note_lines c JOIN "public".credit_notes n ON n.id = c.credit_note_id
               WHERE c.invoice_line_id = il.id AND (n.status = 'issued' OR n.id = OLD.id)) > il.net_amount
           OR (SELECT coalesce(sum(c.tax_amount),0) FROM "public".credit_note_lines c JOIN "public".credit_notes n ON n.id = c.credit_note_id
               WHERE c.invoice_line_id = il.id AND (n.status = 'issued' OR n.id = OLD.id)) > il.tax_amount
      ) THEN
        RAISE EXCEPTION 'Credit notes cannot exceed the credited invoice lines' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.number IS NOT NULL OR NEW.issued_at IS NOT NULL THEN
      PERFORM "public".reject_issued_document_change_field('number');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM "public".reject_issued_document_change_field('status'); END IF;
  IF NEW.number IS DISTINCT FROM OLD.number THEN PERFORM "public".reject_issued_document_change_field('number'); END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN PERFORM "public".reject_issued_document_change_field('kind'); END IF;
  IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_issue_date IS DISTINCT FROM OLD.invoice_issue_date OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    PERFORM "public".reject_issued_document_change_field('invoice reference');
  END IF;
  IF NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN PERFORM "public".reject_issued_document_change_field('issued_at'); END IF;
  IF NEW.issue_date IS DISTINCT FROM OLD.issue_date THEN PERFORM "public".reject_issued_document_change_field('issue_date'); END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency THEN PERFORM "public".reject_issued_document_change_field('currency'); END IF;
  IF NEW.locale IS DISTINCT FROM OLD.locale THEN PERFORM "public".reject_issued_document_change_field('locale'); END IF;
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN PERFORM "public".reject_issued_document_change_field('reason'); END IF;
  IF NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot THEN PERFORM "public".reject_issued_document_change_field('issuer_snapshot'); END IF;
  IF NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot THEN PERFORM "public".reject_issued_document_change_field('client_snapshot'); END IF;
  IF NEW.bank_details_snapshot IS DISTINCT FROM OLD.bank_details_snapshot THEN PERFORM "public".reject_issued_document_change_field('bank_details_snapshot'); END IF;
  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_total IS DISTINCT FROM OLD.tax_total OR NEW.total IS DISTINCT FROM OLD.total THEN
    PERFORM "public".reject_issued_document_change_field('amounts');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER credit_notes_insert_guard BEFORE INSERT ON credit_notes FOR EACH ROW EXECUTE FUNCTION guard_credit_note_insert();
--> statement-breakpoint
CREATE TRIGGER credit_notes_issued_guard BEFORE UPDATE ON credit_notes FOR EACH ROW EXECUTE FUNCTION guard_issued_credit_note();
--> statement-breakpoint
CREATE TRIGGER credit_notes_delete_guard BEFORE DELETE ON credit_notes FOR EACH ROW EXECUTE FUNCTION guard_numbered_document_delete();
--> statement-breakpoint
CREATE TRIGGER credit_note_lines_issued_guard BEFORE INSERT OR UPDATE OR DELETE ON credit_note_lines FOR EACH ROW EXECUTE FUNCTION guard_issued_document_lines('credit_note_id', 'credit_notes');
--> statement-breakpoint
-- A credit note line must credit a line of the SAME invoice and never more than that invoice line holds.
CREATE FUNCTION guard_credit_note_line() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE source record;
BEGIN
  SELECT il.quantity, il.net_amount, il.tax_amount, il.vat_rate, il.unit_price, il.invoice_id INTO source
    FROM "public".invoice_lines il JOIN "public".credit_notes cn ON cn.invoice_id = il.invoice_id
    WHERE il.id = NEW.invoice_line_id AND cn.id = NEW.credit_note_id;
  IF source.invoice_id IS NULL THEN
    RAISE EXCEPTION 'A credit note line must credit a line of the credited invoice' USING ERRCODE = '23514';
  END IF;
  IF NEW.quantity > source.quantity OR NEW.net_amount > source.net_amount OR NEW.tax_amount > source.tax_amount
     OR NEW.vat_rate IS DISTINCT FROM source.vat_rate OR NEW.unit_price <> source.unit_price THEN
    RAISE EXCEPTION 'A credit note line cannot exceed or alter the credited invoice line' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER credit_note_lines_source_guard BEFORE INSERT OR UPDATE ON credit_note_lines FOR EACH ROW EXECUTE FUNCTION guard_credit_note_line();
--> statement-breakpoint
-- TTC total of the issued credit notes of an invoice: the one definition reports, balances and reminders net their
-- invoice totals with (SECURITY INVOKER: row level security still scopes it to the calling tenant).
CREATE FUNCTION invoice_credited_total(target uuid) RETURNS numeric LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(sum(total), 0) FROM "public".credit_notes WHERE invoice_id = target AND status = 'issued'
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_credited_subtotal(target uuid) RETURNS numeric LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(sum(subtotal), 0) FROM "public".credit_notes WHERE invoice_id = target AND status = 'issued'
$$;
--> statement-breakpoint
CREATE FUNCTION invoice_credited_tax(target uuid) RETURNS numeric LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(sum(tax_total), 0) FROM "public".credit_notes WHERE invoice_id = target AND status = 'issued'
$$;
