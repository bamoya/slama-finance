CREATE TABLE IF NOT EXISTS "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error_code" text,
	"initiated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "background_jobs_type" CHECK ("background_jobs"."job_type" in ('prepare_pdf')),
	CONSTRAINT "background_jobs_status" CHECK ("background_jobs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "background_jobs_attempts" CHECK ("background_jobs"."attempts" >= 0 and "background_jobs"."max_attempts" > 0 and "background_jobs"."attempts" <= "background_jobs"."max_attempts"),
	CONSTRAINT "background_jobs_payload_version" CHECK ("background_jobs"."payload_version" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_claim_idx" ON "background_jobs" USING btree ("status","available_at","locked_until");