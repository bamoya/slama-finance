-- Existing logo/signature references are intentionally discarded; re-upload through Media.
-- No object-storage or filesystem files are deleted by this migration.
UPDATE "document_templates" SET "show_signature" = false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by" uuid,
	"expires_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "media_size" CHECK ("media_assets"."byte_size" > 0 and "media_assets"."byte_size" <= 8388608),
	CONSTRAINT "media_hash" CHECK ("media_assets"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_version" CHECK ("media_assets"."version" > 0),
	CONSTRAINT "media_purpose" CHECK ("media_assets"."purpose" in ('company_logo','company_signature','product_image','template_asset')),
	CONSTRAINT "media_status" CHECK ("media_assets"."status" in ('pending','ready','deleting','deleted'))
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "logo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "logo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "signature_asset_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_cleanup_idx" ON "media_assets" USING btree ("status","expires_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_signature_asset_id_media_assets_id_fk" FOREIGN KEY ("signature_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "logo_object_key";--> statement-breakpoint
ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "logo_object_key";--> statement-breakpoint
ALTER TABLE "document_templates" DROP COLUMN IF EXISTS "signature_object_key";
