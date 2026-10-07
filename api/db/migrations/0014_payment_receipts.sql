ALTER TABLE "payments" ADD COLUMN "receipt_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_issued_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "document_artifacts" DROP CONSTRAINT "document_artifacts_type";
--> statement-breakpoint
ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_type" CHECK ("document_type" in ('invoice','estimate','delivery_note','report_run','payment_receipt'));
