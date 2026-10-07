DROP INDEX IF EXISTS "report_runs_occurrence_uq";--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "trigger" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_runs_occurrence_uq" ON "report_runs" USING btree ("schedule_id","scheduled_for") WHERE "report_runs"."trigger" = 'scheduled';--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_trigger" CHECK ("report_runs"."trigger" in ('scheduled', 'test') and ("report_runs"."trigger" <> 'test' or "report_runs"."created_by_user_id" is not null));