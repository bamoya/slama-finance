ALTER TABLE "delivery_notes" DROP CONSTRAINT "delivery_notes_prepared_data";--> statement-breakpoint
ALTER TABLE "delivery_notes" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source_estimate_number_snapshot" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_account_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_prepared_data" CHECK (("delivery_notes"."status" = 'draft' and "delivery_notes"."number" is null) or ("delivery_notes"."status" = 'delivered' and "delivery_notes"."number" is not null) or "delivery_notes"."status" = 'cancelled');

--> statement-breakpoint
-- Preserve existing provenance and payment-bank identities before references can
-- be removed by the new application. Never modify issued printable snapshots.
UPDATE "invoices" AS i
SET "source_estimate_number_snapshot" = e."number"
FROM "estimates" AS e
WHERE i."source_estimate_id" = e."id" AND i."source_estimate_number_snapshot" IS NULL;
--> statement-breakpoint
UPDATE "payments" AS p
SET "bank_account_snapshot" = jsonb_build_object(
  'bankName', b."bank_name", 'accountHolder', b."account_holder",
  'rib', b."rib", 'iban', b."iban")
FROM "bank_accounts" AS b
WHERE p."bank_account_id" = b."id" AND p."bank_account_snapshot" IS NULL;
--> statement-breakpoint
-- Lock legacy ownership edges while validating/inferencing their canonical owner.
-- Ambiguous history must be resolved explicitly; never discard allocation rows.
LOCK TABLE "delivery_notes", "delivery_note_lines", "delivery_invoice_allocations", "invoice_lines"
IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE conflicts text;
BEGIN
  WITH owners AS (
    SELECT id AS note_id, invoice_id FROM delivery_notes WHERE invoice_id IS NOT NULL
    UNION
    SELECT dnl.delivery_note_id, il.invoice_id FROM delivery_note_lines dnl
      JOIN invoice_lines il ON il.id=dnl.source_invoice_line_id
    UNION
    SELECT dnl.delivery_note_id, il.invoice_id FROM delivery_invoice_allocations dia
      JOIN delivery_note_lines dnl ON dnl.id=dia.delivery_note_line_id
      JOIN invoice_lines il ON il.id=dia.invoice_line_id
  ), ambiguous AS (
    SELECT note_id FROM owners GROUP BY note_id HAVING count(DISTINCT invoice_id) > 1
  )
  SELECT string_agg(note_id::text, ', ') INTO conflicts FROM ambiguous;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Migration blocked: delivery notes reference multiple invoices: %', conflicts
      USING ERRCODE='23514', HINT='Reconcile these BL ownership links before retrying. No records are deleted by this migration.';
  END IF;
END $$;
--> statement-breakpoint
WITH owners AS (
  SELECT dnl.delivery_note_id AS note_id, il.invoice_id FROM delivery_note_lines dnl
    JOIN invoice_lines il ON il.id=dnl.source_invoice_line_id
  UNION
  SELECT dnl.delivery_note_id, il.invoice_id FROM delivery_invoice_allocations dia
    JOIN delivery_note_lines dnl ON dnl.id=dia.delivery_note_line_id
    JOIN invoice_lines il ON il.id=dia.invoice_line_id
)
UPDATE delivery_notes AS dn
SET invoice_id=owners.invoice_id, version=dn.version+1, updated_at=now()
FROM owners
WHERE dn.id=owners.note_id AND dn.invoice_id IS NULL;
--> statement-breakpoint
-- A BL has one authoritative invoice owner. Allocations trace lines, not a
-- many-to-many relationship. Deferred checks allow atomic creation/linking.
CREATE FUNCTION assert_delivery_invoice_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE note_ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'delivery_notes' THEN
    note_ids := ARRAY[NEW.id];
  ELSIF TG_TABLE_NAME = 'delivery_note_lines' THEN
    note_ids := ARRAY[NEW.delivery_note_id];
  ELSIF TG_TABLE_NAME = 'delivery_invoice_allocations' THEN
    SELECT ARRAY[delivery_note_id] INTO note_ids FROM delivery_note_lines WHERE id=NEW.delivery_note_line_id;
  ELSE
    SELECT array_agg(DISTINCT dnl.delivery_note_id) INTO note_ids
      FROM delivery_note_lines dnl
      LEFT JOIN delivery_invoice_allocations dia ON dia.delivery_note_line_id=dnl.id
      WHERE dia.invoice_line_id=NEW.id OR dnl.source_invoice_line_id=NEW.id;
  END IF;
  PERFORM id FROM delivery_notes WHERE id=ANY(note_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM delivery_invoice_allocations dia
    JOIN invoice_lines il ON il.id=dia.invoice_line_id
    JOIN delivery_note_lines dnl ON dnl.id=dia.delivery_note_line_id
    JOIN delivery_notes dn ON dn.id=dnl.delivery_note_id
    WHERE dn.id=ANY(note_ids) AND dn.invoice_id IS DISTINCT FROM il.invoice_id
  ) OR EXISTS (
    SELECT 1 FROM delivery_note_lines dnl
    JOIN invoice_lines il ON il.id=dnl.source_invoice_line_id
    JOIN delivery_notes dn ON dn.id=dnl.delivery_note_id
    WHERE dn.id=ANY(note_ids) AND dn.invoice_id IS DISTINCT FROM il.invoice_id
  ) THEN
    RAISE EXCEPTION 'A delivery note can belong to only one invoice' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_allocation AFTER INSERT OR UPDATE ON delivery_invoice_allocations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_note AFTER INSERT OR UPDATE ON delivery_notes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_delivery_line AFTER INSERT OR UPDATE ON delivery_note_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_invoice_line AFTER INSERT OR UPDATE ON invoice_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
