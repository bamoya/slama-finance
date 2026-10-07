CREATE TABLE IF NOT EXISTS "document_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"format" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "document_artifacts_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "document_artifacts_type" CHECK ("document_artifacts"."document_type" in ('invoice', 'estimate', 'delivery_note', 'report_run')),
	CONSTRAINT "document_artifacts_version" CHECK ("document_artifacts"."source_version" > 0),
	CONSTRAINT "document_artifacts_format" CHECK ("document_artifacts"."format" in ('pdf', 'csv')),
	CONSTRAINT "document_artifacts_size" CHECK ("document_artifacts"."byte_size" > 0 and "document_artifacts"."byte_size" <= 8388608),
	CONSTRAINT "document_artifacts_hash" CHECK ("document_artifacts"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_artifacts_owner_version_format_uq" ON "document_artifacts" USING btree ("document_type","document_id","source_version","format");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_artifacts_owner_idx" ON "document_artifacts" USING btree ("document_type","document_id");