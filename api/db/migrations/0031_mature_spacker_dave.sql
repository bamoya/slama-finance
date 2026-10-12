ALTER TABLE "delivery_notes" DROP CONSTRAINT "delivery_notes_status";--> statement-breakpoint
UPDATE "delivery_notes" SET "status" = 'delivered', "delivered_at" = COALESCE("delivered_at", "acknowledged_at", "updated_at"), "updated_at" = now(), "version" = "version" + 1 WHERE "status" = 'acknowledged';--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_status" CHECK ("delivery_notes"."status" in ('draft','delivered','cancelled'));
