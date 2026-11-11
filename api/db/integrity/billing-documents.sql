-- S6 billing documents: quotes, receipts, invoices/lines, allocations and credit notes are immutable.
-- Functions qualify every table and pin search_path; the test fixture rewrites the "public". prefix.
ALTER TABLE billing_quotes ADD CONSTRAINT billing_quotes_version_fk
 FOREIGN KEY (plan_version_id,plan_code) REFERENCES plan_versions(id,plan_code);
--> statement-breakpoint
ALTER TABLE billing_invoice_lines ADD CONSTRAINT billing_invoice_lines_version_fk
 FOREIGN KEY (plan_version_id,plan_code) REFERENCES plan_versions(id,plan_code);
--> statement-breakpoint
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_corrects_fk
 FOREIGN KEY (corrects_invoice_id) REFERENCES billing_invoices(id);
--> statement-breakpoint
ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_quote_fk
 FOREIGN KEY (quote_id) REFERENCES billing_quotes(id);
--> statement-breakpoint
CREATE FUNCTION reject_billing_document_change() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'Issued billing records are immutable; record a correction instead' USING ERRCODE='42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER billing_quotes_immutable BEFORE UPDATE OR DELETE ON billing_quotes FOR EACH ROW EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_receipts_immutable BEFORE UPDATE OR DELETE ON billing_receipts FOR EACH ROW EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_invoices_immutable BEFORE UPDATE OR DELETE ON billing_invoices FOR EACH ROW EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_invoice_lines_immutable BEFORE UPDATE OR DELETE ON billing_invoice_lines FOR EACH ROW EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_allocations_immutable BEFORE UPDATE OR DELETE ON billing_allocations FOR EACH ROW EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_quotes_truncate BEFORE TRUNCATE ON billing_quotes FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_receipts_truncate BEFORE TRUNCATE ON billing_receipts FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_invoices_truncate BEFORE TRUNCATE ON billing_invoices FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_invoice_lines_truncate BEFORE TRUNCATE ON billing_invoice_lines FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
CREATE TRIGGER billing_allocations_truncate BEFORE TRUNCATE ON billing_allocations FOR EACH STATEMENT EXECUTE FUNCTION reject_billing_document_change();
--> statement-breakpoint
-- A submission repeats its quote's snapshot exactly (same owner, plan, version, cycle, kind, money).
-- quote_id and the snapshot columns are never updatable by the runtime (column grants).
CREATE FUNCTION check_payment_quote() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE q "public".billing_quotes%ROWTYPE;
BEGIN
 IF NEW.quote_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO q FROM "public".billing_quotes WHERE id=NEW.quote_id;
 IF NOT FOUND OR q.owner_id<>NEW.owner_id OR q.plan_code<>NEW.plan_code OR q.plan_version_id<>NEW.plan_version_id
  OR q.cycle<>NEW.cycle OR q.kind<>NEW.kind OR q.currency<>NEW.currency OR q.amount_ht<>NEW.amount_ht
  OR q.tax_rate_basis_points IS DISTINCT FROM NEW.tax_rate_basis_points OR q.tax_amount<>NEW.tax_amount
  OR q.amount_ttc<>NEW.amount_ttc THEN
  RAISE EXCEPTION 'A payment repeats the snapshot of its quote' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_payment_quote_snapshot BEFORE INSERT ON subscription_payments FOR EACH ROW EXECUTE FUNCTION check_payment_quote();
--> statement-breakpoint
-- A receipt belongs to its payment's owner and currency.
CREATE FUNCTION check_billing_receipt() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "public".subscription_payments p WHERE p.id=NEW.payment_id AND p.owner_id=NEW.owner_id AND p.currency=NEW.currency AND p.quote_id IS NOT NULL) THEN
  RAISE EXCEPTION 'A receipt matches the owner and currency of a quoted payment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER billing_receipt_payment BEFORE INSERT ON billing_receipts FOR EACH ROW EXECUTE FUNCTION check_billing_receipt();
--> statement-breakpoint
-- At commit: an invoice equals the sum of its lines (at least one); an invoice belongs to its payment's
-- owner and repeats its quote's customer; a credit note corrects an invoice of the same owner, customer,
-- currency and tax rate, and the credited
-- total never exceeds that invoice.
CREATE FUNCTION check_billing_invoice() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 inv "public".billing_invoices%ROWTYPE;
 orig "public".billing_invoices%ROWTYPE;
 sums record;
BEGIN
 SELECT * INTO inv FROM "public".billing_invoices
  WHERE id=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='billing_invoice_lines' THEN 'invoice_id' ELSE 'id' END)::uuid;
 SELECT count(*) AS n, coalesce(sum(amount_ht),0) AS ht, coalesce(sum(tax_amount),0) AS tax,
  bool_and(currency=inv.currency AND tax_rate_basis_points IS NOT DISTINCT FROM inv.tax_rate_basis_points) AS same
  INTO sums FROM "public".billing_invoice_lines WHERE invoice_id=inv.id;
 IF sums.n=0 OR sums.ht<>inv.amount_ht OR sums.tax<>inv.tax_amount OR NOT sums.same THEN
  RAISE EXCEPTION 'An invoice equals the sum of its lines' USING ERRCODE='23514';
 END IF;
 IF inv.kind='invoice' AND NOT EXISTS (SELECT 1 FROM "public".subscription_payments p WHERE p.id=inv.payment_id AND p.owner_id=inv.owner_id AND p.currency=inv.currency) THEN
  RAISE EXCEPTION 'An invoice belongs to its payment''s owner' USING ERRCODE='23514';
 END IF;
 IF inv.kind='invoice' AND NOT EXISTS (SELECT 1 FROM "public".subscription_payments p JOIN "public".billing_quotes q ON q.id=p.quote_id
   WHERE p.id=inv.payment_id AND q.customer=inv.customer) THEN
  RAISE EXCEPTION 'An invoice repeats the customer snapshot of its quote' USING ERRCODE='23514';
 END IF;
 IF inv.kind='credit_note' THEN
  SELECT * INTO orig FROM "public".billing_invoices WHERE id=inv.corrects_invoice_id;
  IF orig.kind<>'invoice' OR orig.owner_id<>inv.owner_id OR orig.currency<>inv.currency
   OR orig.customer<>inv.customer
   OR orig.tax_rate_basis_points IS DISTINCT FROM inv.tax_rate_basis_points THEN
   RAISE EXCEPTION 'A credit note corrects an invoice of the same owner, customer, currency and tax rate' USING ERRCODE='23514';
  END IF;
  IF (SELECT sum(amount_ttc)>orig.amount_ttc OR sum(amount_ht)>orig.amount_ht OR sum(tax_amount)>orig.tax_amount
      FROM "public".billing_invoices WHERE corrects_invoice_id=orig.id) THEN
   RAISE EXCEPTION 'Credit notes exceed the invoice' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_invoice_totals AFTER INSERT ON billing_invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_billing_invoice();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_invoice_line_totals AFTER INSERT ON billing_invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_billing_invoice();
--> statement-breakpoint
-- At commit: an allocation joins a receipt and an invoice of the same owner/currency; per receipt the
-- allocations never exceed it, per invoice never exceed its TTC minus credit notes.
CREATE FUNCTION check_billing_allocation() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE r "public".billing_receipts%ROWTYPE; inv "public".billing_invoices%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "public".billing_receipts WHERE id=NEW.receipt_id;
 SELECT * INTO inv FROM "public".billing_invoices WHERE id=NEW.invoice_id;
 IF inv.kind<>'invoice' OR inv.owner_id<>r.owner_id OR inv.currency<>r.currency THEN
  RAISE EXCEPTION 'An allocation joins a receipt and an invoice of the same owner and currency' USING ERRCODE='23514';
 END IF;
 IF (SELECT sum(amount_ttc) FROM "public".billing_allocations WHERE receipt_id=r.id)>r.amount_ttc THEN
  RAISE EXCEPTION 'Allocations exceed the receipt' USING ERRCODE='23514';
 END IF;
 IF (SELECT sum(amount_ttc) FROM "public".billing_allocations WHERE invoice_id=inv.id)
  >inv.amount_ttc-coalesce((SELECT sum(amount_ttc) FROM "public".billing_invoices WHERE corrects_invoice_id=inv.id),0) THEN
  RAISE EXCEPTION 'Allocations exceed the invoice balance' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER billing_allocation_bounds AFTER INSERT ON billing_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_billing_allocation();
