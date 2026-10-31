-- BaMoYa Finance: fresh SaaS schema; no demo accounts or business data.
CREATE TABLE IF NOT EXISTS "actors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"staff_id" uuid,
	"owner_id" uuid,
	CONSTRAINT "actor_identity" CHECK (("actors"."kind"='staff' and "actors"."staff_id"="actors"."id" and "actors"."owner_id" is null) or ("actors"."kind"='owner' and "actors"."owner_id"="actors"."id" and "actors"."staff_id" is null))
);

--> statement-breakpoint

ALTER TABLE "actors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "platform_admin_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_admin_sessions_window" CHECK ("platform_admin_sessions"."expires_at" > "platform_admin_sessions"."created_at")
);

--> statement-breakpoint

ALTER TABLE "platform_admin_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"totp_secret" text,
	"totp_enrolled_at" timestamp with time zone,
	"totp_last_step" bigint,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_normalized" CHECK ("platform_admins"."email" = lower(btrim("platform_admins"."email")) and "platform_admins"."email" <> ''),
	CONSTRAINT "platform_admins_name_present" CHECK (btrim("platform_admins"."name") <> ''),
	CONSTRAINT "platform_admins_enrollment" CHECK ("platform_admins"."totp_enrolled_at" is null or "platform_admins"."totp_secret" is not null)
);

--> statement-breakpoint

ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_artifacts" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
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
	"created_by_actor_id" uuid,
	CONSTRAINT "artifact_storage_scope" CHECK (starts_with("document_artifacts"."object_key", 'organizations/' || "document_artifacts"."organization_id"::text || '/artifacts/')),
	CONSTRAINT "document_artifacts_type" CHECK ("document_artifacts"."document_type" in ('invoice', 'estimate', 'delivery_note', 'report_run', 'payment_receipt')),
	CONSTRAINT "document_artifacts_version" CHECK ("document_artifacts"."source_version" > 0),
	CONSTRAINT "document_artifacts_format" CHECK ("document_artifacts"."format" in ('pdf', 'csv', 'xlsx') and ("document_artifacts"."format" <> 'xlsx' or "document_artifacts"."document_type" = 'report_run')),
	CONSTRAINT "document_artifacts_size" CHECK ("document_artifacts"."byte_size" > 0 and "document_artifacts"."byte_size" <= 8388608),
	CONSTRAINT "document_artifacts_hash" CHECK ("document_artifacts"."sha256" ~ '^[a-f0-9]{64}$')
);

--> statement-breakpoint

ALTER TABLE "document_artifacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "role_permissions" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);

--> statement-breakpoint

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(24) DEFAULT 'full' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_purpose_check" CHECK ("sessions"."purpose" IN ('full', 'password_change'))
);

--> statement-breakpoint

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_roles" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);

--> statement-breakpoint

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_settings" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" varchar(12) DEFAULT 'fr' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Africa/Casablanca' NOT NULL,
	"theme" varchar(12) DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"temporary_password_expires_at" timestamp with time zone,
	"temporary_password_consumed_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"avatar_url" text,
	"email_verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_categories" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "category_name_nonblank" CHECK (length(trim("product_categories"."name")) > 0),
	CONSTRAINT "category_version_positive" CHECK ("product_categories"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "product_variants" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"weight_g" integer NOT NULL,
	"price_per_item" numeric(18, 2) NOT NULL,
	"cost_per_item" numeric(18, 2),
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "variant_weight_positive" CHECK ("product_variants"."weight_g" > 0),
	CONSTRAINT "variant_price_nonnegative" CHECK ("product_variants"."price_per_item" >= 0),
	CONSTRAINT "variant_cost_nonnegative" CHECK ("product_variants"."cost_per_item" is null or "product_variants"."cost_per_item" >= 0),
	CONSTRAINT "variant_version_positive" CHECK ("product_variants"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "products" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"image_asset_id" uuid,
	"suggested_vat_rate" numeric(5, 2),
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "product_name_nonblank" CHECK (length(trim("products"."name")) > 0),
	CONSTRAINT "product_reference_nonblank" CHECK (length(trim("products"."reference")) > 0),
	CONSTRAINT "product_vat_range" CHECK ("products"."suggested_vat_rate" is null or ("products"."suggested_vat_rate" >= 0 and "products"."suggested_vat_rate" <= 100)),
	CONSTRAINT "product_version_positive" CHECK ("products"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "clients" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"legal_name" text,
	"trade_name" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"ice" text,
	"tax_identifier" text,
	"registration_number" text,
	"registration_city" text,
	"professional_tax_number" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"country_code" text,
	"delivery_address_line1" text,
	"delivery_address_line2" text,
	"delivery_city" text,
	"delivery_postal_code" text,
	"delivery_country_code" text,
	"locale" text DEFAULT 'fr-MA' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "client_type_valid" CHECK ("clients"."type" in ('individual', 'company')),
	CONSTRAINT "client_identity_valid" CHECK ((
    ("clients"."type" = 'individual' and (length(trim(coalesce("clients"."first_name",''))) > 0 or length(trim(coalesce("clients"."last_name",''))) > 0)
      and "clients"."legal_name" is null and "clients"."trade_name" is null and "clients"."contact_name" is null
      and "clients"."ice" is null and "clients"."tax_identifier" is null and "clients"."registration_number" is null
      and "clients"."registration_city" is null and "clients"."professional_tax_number" is null)
    or ("clients"."type" = 'company' and "clients"."legal_name" is not null and length(trim("clients"."legal_name")) > 0 and "clients"."first_name" is null and "clients"."last_name" is null)
  )),
	CONSTRAINT "client_billing_address" CHECK ("clients"."country_code" is null or "clients"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "client_delivery_address" CHECK ("clients"."delivery_country_code" is null or "clients"."delivery_country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "client_locale_valid" CHECK ("clients"."locale" in ('fr-MA', 'en-GB')),
	CONSTRAINT "client_version_positive" CHECK ("clients"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_invoice_allocations" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"delivery_note_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "delivery_invoice_allocations_invoice_line_id_delivery_note_line_id_pk" PRIMARY KEY("invoice_line_id","delivery_note_line_id"),
	CONSTRAINT "delivery_invoice_allocations_quantity" CHECK ("delivery_invoice_allocations"."quantity" > 0)
);

--> statement-breakpoint

ALTER TABLE "delivery_invoice_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_note_lines" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_note_id" uuid NOT NULL,
	"product_id" uuid,
	"product_variant_id" uuid,
	"source_invoice_line_id" uuid,
	"position" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_reference" text,
	"package_weight_g" integer,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "delivery_note_lines_position" CHECK ("delivery_note_lines"."position" >= 0),
	CONSTRAINT "delivery_note_lines_quantity" CHECK ("delivery_note_lines"."quantity" > 0),
	CONSTRAINT "delivery_note_lines_name" CHECK (length(trim("delivery_note_lines"."product_name")) > 0),
	CONSTRAINT "delivery_note_lines_weight" CHECK ("delivery_note_lines"."package_weight_g" is null or "delivery_note_lines"."package_weight_g" > 0),
	CONSTRAINT "delivery_note_lines_variant_pair" CHECK ("delivery_note_lines"."product_variant_id" is null or "delivery_note_lines"."product_id" is not null)
);

--> statement-breakpoint

ALTER TABLE "delivery_note_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_notes" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"client_id" uuid,
	"invoice_id" uuid,
	"template_id" uuid,
	"appearance_snapshot" jsonb DEFAULT '{"layout":"classic","density":"standard","accentColor":"#ad7d1d"}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"delivery_date" date NOT NULL,
	"issuer_snapshot" jsonb NOT NULL,
	"locale_override" text,
	"client_snapshot" jsonb NOT NULL,
	"delivery_address" text NOT NULL,
	"instructions" text,
	"include_reception_signature" boolean DEFAULT true NOT NULL,
	"received_by_name" text,
	"signature_object_key" text,
	"delivered_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "delivery_notes_status" CHECK ("delivery_notes"."status" in ('draft','delivered','cancelled')),
	CONSTRAINT "delivery_notes_versions" CHECK ("delivery_notes"."version" > 0 and "delivery_notes"."content_version" > 0),
	CONSTRAINT "delivery_notes_locale_override" CHECK ("delivery_notes"."locale_override" is null or "delivery_notes"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "delivery_notes_prepared_data" CHECK (("delivery_notes"."status" = 'draft' and "delivery_notes"."number" is null) or ("delivery_notes"."status" = 'delivered' and "delivery_notes"."number" is not null) or "delivery_notes"."status" = 'cancelled')
);

--> statement-breakpoint

ALTER TABLE "delivery_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "estimate_lines" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"product_id" uuid,
	"product_variant_id" uuid,
	"position" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_reference" text,
	"package_weight_g" integer,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"vat_rate" numeric(5, 2),
	"net_amount" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "estimate_lines_position" CHECK ("estimate_lines"."position" >= 0),
	CONSTRAINT "estimate_lines_product_name" CHECK (length(trim("estimate_lines"."product_name")) > 0),
	CONSTRAINT "estimate_lines_quantity" CHECK ("estimate_lines"."quantity" > 0),
	CONSTRAINT "estimate_lines_price" CHECK ("estimate_lines"."unit_price" >= 0),
	CONSTRAINT "estimate_lines_weight" CHECK ("estimate_lines"."package_weight_g" is null or "estimate_lines"."package_weight_g" > 0),
	CONSTRAINT "estimate_lines_vat" CHECK ("estimate_lines"."vat_rate" is null or ("estimate_lines"."vat_rate" >= 0 and "estimate_lines"."vat_rate" <= 100)),
	CONSTRAINT "estimate_lines_totals" CHECK ("estimate_lines"."net_amount" >= 0 and "estimate_lines"."tax_amount" >= 0 and "estimate_lines"."total_amount" = "estimate_lines"."net_amount" + "estimate_lines"."tax_amount"),
	CONSTRAINT "estimate_lines_variant_pair" CHECK ("estimate_lines"."product_variant_id" is null or "estimate_lines"."product_id" is not null)
);

--> statement-breakpoint

ALTER TABLE "estimate_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "estimates" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision_of_id" uuid,
	"client_id" uuid,
	"template_id" uuid,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"locale" text DEFAULT 'fr-MA' NOT NULL,
	"locale_override" text,
	"issuer_snapshot" jsonb NOT NULL,
	"client_snapshot" jsonb NOT NULL,
	"appearance_snapshot" jsonb NOT NULL,
	"bank_details_snapshot" jsonb,
	"bank_account_id" uuid,
	"agreed_payment_method" text,
	"notes" text,
	"payment_terms" text,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"issued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "estimates_revision_not_self" CHECK ("estimates"."revision_of_id" is null or "estimates"."revision_of_id" <> "estimates"."id"),
	CONSTRAINT "estimates_status" CHECK ("estimates"."status" in ('draft','issued','sent','accepted','rejected','expired','cancelled','superseded')),
	CONSTRAINT "estimates_currency" CHECK ("estimates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "estimates_agreed_payment_method" CHECK ("estimates"."agreed_payment_method" is null or "estimates"."agreed_payment_method" in ('cash','bank_transfer','cheque')),
	CONSTRAINT "estimates_locale" CHECK ("estimates"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "estimates_locale_override" CHECK ("estimates"."locale_override" is null or "estimates"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "estimates_versions" CHECK ("estimates"."version" > 0 and "estimates"."content_version" > 0),
	CONSTRAINT "estimates_totals" CHECK ("estimates"."subtotal" >= 0 and "estimates"."tax_total" >= 0 and "estimates"."total" = "estimates"."subtotal" + "estimates"."tax_total"),
	CONSTRAINT "estimates_issued_data" CHECK (("estimates"."status" = 'draft' and "estimates"."number" is null and "estimates"."issued_at" is null) or ("estimates"."status" <> 'draft' and "estimates"."number" is not null and "estimates"."issued_at" is not null and "estimates"."valid_until" is not null))
);

--> statement-breakpoint

ALTER TABLE "estimates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invoice_lines" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid,
	"product_variant_id" uuid,
	"position" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_reference" text,
	"package_weight_g" integer,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"vat_rate" numeric(5, 2),
	"net_amount" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "invoice_lines_position" CHECK ("invoice_lines"."position" >= 0),
	CONSTRAINT "invoice_lines_product_name" CHECK (length(trim("invoice_lines"."product_name")) > 0),
	CONSTRAINT "invoice_lines_quantity" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_price" CHECK ("invoice_lines"."unit_price" >= 0),
	CONSTRAINT "invoice_lines_weight" CHECK ("invoice_lines"."package_weight_g" is null or "invoice_lines"."package_weight_g" > 0),
	CONSTRAINT "invoice_lines_vat" CHECK ("invoice_lines"."vat_rate" is null or ("invoice_lines"."vat_rate" >= 0 and "invoice_lines"."vat_rate" <= 100)),
	CONSTRAINT "invoice_lines_totals" CHECK ("invoice_lines"."net_amount" >= 0 and "invoice_lines"."tax_amount" >= 0 and "invoice_lines"."total_amount" = "invoice_lines"."net_amount" + "invoice_lines"."tax_amount"),
	CONSTRAINT "invoice_lines_variant_pair" CHECK ("invoice_lines"."product_variant_id" is null or "invoice_lines"."product_id" is not null)
);

--> statement-breakpoint

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invoices" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"template_id" uuid,
	"source_estimate_id" uuid,
	"source_estimate_number_snapshot" text,
	"conversion_operation_id" uuid,
	"conversion_request" jsonb,
	"issue_date" date NOT NULL,
	"due_date" date,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"locale" text DEFAULT 'fr-MA' NOT NULL,
	"locale_override" text,
	"issuer_snapshot" jsonb NOT NULL,
	"client_snapshot" jsonb NOT NULL,
	"appearance_snapshot" jsonb NOT NULL,
	"bank_details_snapshot" jsonb,
	"bank_account_id" uuid,
	"agreed_payment_method" text,
	"notes" text,
	"payment_terms" text,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"issued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" in ('draft','issued','sent','cancelled')),
	CONSTRAINT "invoices_currency" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_agreed_payment_method" CHECK ("invoices"."agreed_payment_method" is null or "invoices"."agreed_payment_method" in ('cash','bank_transfer','cheque')),
	CONSTRAINT "invoices_locale" CHECK ("invoices"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "invoices_locale_override" CHECK ("invoices"."locale_override" is null or "invoices"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "invoices_versions" CHECK ("invoices"."version" > 0 and "invoices"."content_version" > 0),
	CONSTRAINT "invoices_totals" CHECK ("invoices"."subtotal" >= 0 and "invoices"."tax_total" >= 0 and "invoices"."total" = "invoices"."subtotal" + "invoices"."tax_total"),
	CONSTRAINT "invoices_issued_data" CHECK (("invoices"."status" = 'draft' and "invoices"."number" is null and "invoices"."issued_at" is null) or ("invoices"."status" <> 'draft' and "invoices"."number" is not null and "invoices"."issued_at" is not null and "invoices"."due_date" is not null)),
	CONSTRAINT "invoices_conversion_pair" CHECK (("invoices"."conversion_operation_id" is null) = ("invoices"."conversion_request" is null) and ("invoices"."source_estimate_id" is null or "invoices"."conversion_operation_id" is not null))
);

--> statement-breakpoint

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "background_jobs" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
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
	"initiated_by_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "background_jobs_type" CHECK ("background_jobs"."job_type" in ('prepare_pdf','prepare_notification')),
	CONSTRAINT "background_jobs_status" CHECK ("background_jobs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "background_jobs_attempts" CHECK ("background_jobs"."attempts" >= 0 and "background_jobs"."max_attempts" > 0 and "background_jobs"."attempts" <= "background_jobs"."max_attempts"),
	CONSTRAINT "background_jobs_payload_version" CHECK ("background_jobs"."payload_version" > 0)
);

--> statement-breakpoint

ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "media_assets" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
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
	CONSTRAINT "media_storage_scope" CHECK (starts_with("media_assets"."object_key", 'organizations/' || "media_assets"."organization_id"::text || '/media/')),
	CONSTRAINT "media_size" CHECK ("media_assets"."byte_size" > 0 and "media_assets"."byte_size" <= 8388608),
	CONSTRAINT "media_hash" CHECK ("media_assets"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_version" CHECK ("media_assets"."version" > 0),
	CONSTRAINT "media_purpose" CHECK ("media_assets"."purpose" in ('company_logo','company_signature','product_image','template_asset')),
	CONSTRAINT "media_status" CHECK ("media_assets"."status" in ('pending','ready','deleting','deleted'))
);

--> statement-breakpoint

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"purpose" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_brand_assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "organization_brand_size" CHECK ("organization_brand_assets"."byte_size">0 and "organization_brand_assets"."byte_size"<=8388608),
	CONSTRAINT "organization_brand_purpose" CHECK ("organization_brand_assets"."purpose" in ('company_logo','company_signature'))
);

--> statement-breakpoint

ALTER TABLE "organization_brand_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_notification_preferences" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "client_notification_preferences_client_id_rule_id_pk" PRIMARY KEY("client_id","rule_id"),
	CONSTRAINT "client_notification_preferences_version" CHECK ("client_notification_preferences"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "client_notification_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_dispatches" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"logical_occurrence_key" text NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"message_id" uuid NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	CONSTRAINT "notification_dispatches_source" CHECK ("notification_dispatches"."source_type" in ('invoice','estimate','payment','delivery_note','report_run')),
	CONSTRAINT "notification_dispatches_event" CHECK ("notification_dispatches"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder','report_available'))
);

--> statement-breakpoint

ALTER TABLE "notification_dispatches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "notification_rules" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"repeat_every_days" integer,
	"sender_name" text DEFAULT 'Slama Finance' NOT NULL,
	"sender_email" text DEFAULT 'notifications@example.invalid' NOT NULL,
	"locale" text DEFAULT 'company' NOT NULL,
	"english_subject_template" text,
	"english_body_template" text,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"body_format" text DEFAULT 'text' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "notification_rules_event" CHECK ("notification_rules"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder')),
	CONSTRAINT "notification_rules_timing" CHECK ("notification_rules"."offset_days" between -365 and 365 and ("notification_rules"."repeat_every_days" is null or "notification_rules"."repeat_every_days" between 1 and 365) and ("notification_rules"."event_key" in ('invoice_due_reminder','estimate_expiry_reminder') or ("notification_rules"."offset_days" = 0 and "notification_rules"."repeat_every_days" is null))),
	CONSTRAINT "notification_rules_version" CHECK ("notification_rules"."version" > 0),
	CONSTRAINT "notification_rules_body_format" CHECK ("notification_rules"."body_format" in ('text','html')),
	CONSTRAINT "notification_rules_locale" CHECK ("notification_rules"."locale" in ('company','fr-MA','en-GB'))
);

--> statement-breakpoint

ALTER TABLE "notification_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbound_message_attachments" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_scope" CHECK (starts_with("outbound_message_attachments"."object_key", 'organizations/' || "outbound_message_attachments"."organization_id"::text || '/artifacts/')),
	CONSTRAINT "outbound_message_attachments_size" CHECK ("outbound_message_attachments"."byte_size" > 0 and "outbound_message_attachments"."byte_size" <= 8388608),
	CONSTRAINT "outbound_message_attachments_position" CHECK ("outbound_message_attachments"."position" >= 0)
);

--> statement-breakpoint

ALTER TABLE "outbound_message_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbound_messages" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" text NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text_body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"locked_until" timestamp with time zone,
	"first_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error_code" text,
	"payload_erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	CONSTRAINT "outbound_messages_status" CHECK ("outbound_messages"."status" in ('queued','sending','sent','failed','cancelled')),
	CONSTRAINT "outbound_messages_attempts" CHECK ("outbound_messages"."attempts" >= 0 and "outbound_messages"."max_attempts" > 0 and "outbound_messages"."attempts" <= "outbound_messages"."max_attempts"),
	CONSTRAINT "outbound_messages_lease" CHECK (("outbound_messages"."status" = 'sending') = ("outbound_messages"."lease_token" is not null and "outbound_messages"."locked_until" is not null)),
	CONSTRAINT "outbound_messages_completion" CHECK (("outbound_messages"."status" = 'sent') = ("outbound_messages"."sent_at" is not null and "outbound_messages"."provider_message_id" is not null)),
	CONSTRAINT "outbound_messages_hash" CHECK ("outbound_messages"."payload_hash" ~ '^[a-f0-9]{64}$')
);

--> statement-breakpoint

ALTER TABLE "outbound_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_profiles" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"configuration" jsonb NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_profile_step" CHECK ("organization_profiles"."current_step" between 1 and 6),
	CONSTRAINT "organization_profile_version" CHECK ("organization_profiles"."version">0)
);

--> statement-breakpoint

ALTER TABLE "organization_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_admin_deliveries" (
	"organization_id" uuid PRIMARY KEY DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error_code" text,
	CONSTRAINT "admin_delivery_status" CHECK ("organization_admin_deliveries"."status" in ('pending','sending','sent','skipped','failed')),
	CONSTRAINT "admin_delivery_attempts" CHECK ("organization_admin_deliveries"."attempts">=0 and "organization_admin_deliveries"."attempts"<=5)
);

--> statement-breakpoint

ALTER TABLE "organization_admin_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organization_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"verified_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_domains_hostname_format" CHECK (char_length("organization_domains"."hostname") between 3 and 253 and "organization_domains"."hostname" = lower("organization_domains"."hostname") and "organization_domains"."hostname" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
	CONSTRAINT "organization_domains_activation_verified" CHECK ("organization_domains"."activated_at" is null or "organization_domains"."verified_at" is not null)
);

--> statement-breakpoint

ALTER TABLE "organization_domains" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"activated_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"deletion_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_present" CHECK (btrim("organizations"."name") <> ''),
	CONSTRAINT "organizations_slug_format" CHECK (char_length("organizations"."slug") between 1 and 63 and "organizations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "organizations_locale" CHECK ("organizations"."locale" in ('fr', 'en')),
	CONSTRAINT "organizations_deletion_window" CHECK (("organizations"."deletion_requested_at" is null and "organizations"."deletion_due_at" is null) or ("organizations"."deletion_requested_at" is not null and "organizations"."deletion_due_at" is not null and "organizations"."deletion_due_at" > "organizations"."deletion_requested_at"))
);

--> statement-breakpoint

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_account_tokens_purpose" CHECK ("owner_account_tokens"."purpose" in ('verify_email', 'reset_password'))
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_locale" CHECK ("platform_users"."locale" in ('fr', 'en')),
	CONSTRAINT "platform_users_email_normalized" CHECK ("platform_users"."email" = lower(btrim("platform_users"."email")) and "platform_users"."email" <> '')
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payments" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"creation_request" jsonb NOT NULL,
	"receipt_snapshot" jsonb,
	"receipt_issued_at" timestamp with time zone,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"payment_date" date NOT NULL,
	"collected_on" date,
	"bank_account_id" uuid,
	"bank_account_snapshot" jsonb,
	"reference" text,
	"cheque_bank" text,
	"cheque_number" text,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_currency" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_method" CHECK ("payments"."method" in ('cash','bank_transfer','cheque')),
	CONSTRAINT "payments_status" CHECK ("payments"."status" in ('pending','confirmed','cancelled')),
	CONSTRAINT "payments_version" CHECK ("payments"."version" > 0),
	CONSTRAINT "payments_method_fields" CHECK ((
      ("payments"."method" = 'cash' and "payments"."status" <> 'pending' and "payments"."bank_account_id" is null and "payments"."reference" is null and "payments"."cheque_bank" is null and "payments"."cheque_number" is null)
      or ("payments"."method" = 'bank_transfer' and "payments"."cheque_bank" is null and "payments"."cheque_number" is null)
      or ("payments"."method" = 'cheque' and "payments"."cheque_bank" is not null and length(trim("payments"."cheque_bank")) > 0 and "payments"."cheque_number" is not null and length(trim("payments"."cheque_number")) > 0 and "payments"."reference" is null)
    )),
	CONSTRAINT "payments_status_dates" CHECK ((
      ("payments"."status" = 'pending' and "payments"."collected_on" is null and "payments"."confirmed_at" is null and "payments"."cancelled_at" is null and "payments"."cancellation_reason" is null)
      or ("payments"."status" = 'confirmed' and "payments"."collected_on" is not null and "payments"."confirmed_at" is not null and "payments"."cancelled_at" is null and "payments"."cancellation_reason" is null)
      or ("payments"."status" = 'cancelled' and "payments"."cancelled_at" is not null and "payments"."cancellation_reason" is not null and length(trim("payments"."cancellation_reason")) > 0)
    ))
);

--> statement-breakpoint

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "report_runs" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"configuration_snapshot" jsonb NOT NULL,
	"data_snapshot" jsonb,
	"data_captured_at" timestamp with time zone,
	"recipient_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	CONSTRAINT "report_runs_trigger" CHECK ("report_runs"."trigger" in ('scheduled', 'test') and ("report_runs"."trigger" <> 'test' or "report_runs"."created_by_actor_id" is not null)),
	CONSTRAINT "report_runs_status" CHECK ("report_runs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "report_runs_attempts" CHECK ("report_runs"."attempts" >= 0 and "report_runs"."max_attempts" > 0 and "report_runs"."attempts" <= "report_runs"."max_attempts"),
	CONSTRAINT "report_runs_period" CHECK ("report_runs"."period_start" <= "report_runs"."period_end"),
	CONSTRAINT "report_runs_capture_pair" CHECK (("report_runs"."data_snapshot" is null) = ("report_runs"."data_captured_at" is null)),
	CONSTRAINT "report_runs_lease" CHECK (("report_runs"."status"='running' and "report_runs"."lease_token" is not null and "report_runs"."locked_until" is not null) or ("report_runs"."status"<>'running' and "report_runs"."lease_token" is null and "report_runs"."locked_until" is null)),
	CONSTRAINT "report_runs_complete" CHECK ("report_runs"."status" not in ('succeeded','failed','cancelled') or "report_runs"."finished_at" is not null),
	CONSTRAINT "report_runs_succeeded_capture" CHECK ("report_runs"."status"<>'succeeded' or "report_runs"."data_snapshot" is not null)
);

--> statement-breakpoint

ALTER TABLE "report_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "report_schedule_recipients" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	CONSTRAINT "report_schedule_recipients_schedule_id_user_id_pk" PRIMARY KEY("schedule_id","user_id")
);

--> statement-breakpoint

ALTER TABLE "report_schedule_recipients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "report_schedules" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"frequency" text NOT NULL,
	"language" text DEFAULT 'company' NOT NULL,
	"output" text DEFAULT 'pdf' NOT NULL,
	"weekday" integer,
	"month_day" integer,
	"local_time" text NOT NULL,
	"timezone" text NOT NULL,
	"period" text NOT NULL,
	"included_sections" text[] NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "report_schedules_name" CHECK (length(trim("report_schedules"."name")) between 1 and 160),
	CONSTRAINT "report_schedules_version" CHECK ("report_schedules"."version" > 0),
	CONSTRAINT "report_schedules_language" CHECK ("report_schedules"."language" in ('company', 'fr', 'en')),
	CONSTRAINT "report_schedules_output" CHECK ("report_schedules"."output" in ('pdf', 'excel', 'both')),
	CONSTRAINT "report_schedules_cadence" CHECK (("report_schedules"."frequency"='daily' and "report_schedules"."weekday" is null and "report_schedules"."month_day" is null) or ("report_schedules"."frequency"='weekly' and "report_schedules"."weekday" is not null and "report_schedules"."weekday" between 1 and 7 and "report_schedules"."month_day" is null) or ("report_schedules"."frequency"='monthly' and "report_schedules"."weekday" is null and "report_schedules"."month_day" is not null and "report_schedules"."month_day" between 1 and 28)),
	CONSTRAINT "report_schedules_time" CHECK ("report_schedules"."local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "report_schedules_period" CHECK ("report_schedules"."period" in ('previous_day','previous_week','previous_month')),
	CONSTRAINT "report_schedules_sections" CHECK (cardinality("report_schedules"."included_sections") between 1 and 13 and "report_schedules"."included_sections" <@ array['summary','revenue','collections','outstanding','overdue','payment_methods','pending_cheques','vat','sales_by_client','sales_by_product','sales_by_category','estimates','deliveries']::text[]),
	CONSTRAINT "report_schedules_sections_unique" CHECK (array_position("report_schedules"."included_sections", null) is null and cardinality("report_schedules"."included_sections") = (case when 'summary'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'revenue'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'collections'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'outstanding'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'overdue'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'payment_methods'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'pending_cheques'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'vat'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'sales_by_client'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'sales_by_product'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'sales_by_category'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'estimates'=any("report_schedules"."included_sections") then 1 else 0 end + case when 'deliveries'=any("report_schedules"."included_sections") then 1 else 0 end)),
	CONSTRAINT "report_schedules_active" CHECK (("report_schedules"."enabled" and "report_schedules"."next_run_at" is not null and "report_schedules"."archived_at" is null) or (not "report_schedules"."enabled" and "report_schedules"."next_run_at" is null))
);

--> statement-breakpoint

ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "audit_events" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_key" jsonb NOT NULL,
	"before_values" jsonb,
	"after_values" jsonb,
	"reason" text,
	"request_id" uuid,
	"ip_address" text
);

--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_holder" text NOT NULL,
	"rib" text,
	"iban" text,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "bank_rib" CHECK ("bank_accounts"."rib" is null or "bank_accounts"."rib" ~ '^[0-9]{24}$'),
	CONSTRAINT "bank_identifier" CHECK ("bank_accounts"."rib" is not null or "bank_accounts"."iban" is not null),
	CONSTRAINT "bank_version" CHECK ("bank_accounts"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "company_settings" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" smallint DEFAULT 1 NOT NULL,
	"legal_name" text,
	"trade_name" text,
	"legal_form" text,
	"share_capital" numeric(18, 2),
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postal_code" text,
	"country_code" text DEFAULT 'MA' NOT NULL,
	"ice" text,
	"tax_identifier" text,
	"registration_number" text,
	"registration_city" text,
	"professional_tax_number" text,
	"email" text,
	"phone" text,
	"logo_asset_id" uuid,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"locale" text DEFAULT 'fr-MA' NOT NULL,
	"timezone" text DEFAULT 'Africa/Casablanca' NOT NULL,
	"payment_due_days" integer DEFAULT 15 NOT NULL,
	"estimate_valid_days" integer DEFAULT 15 NOT NULL,
	"default_vat_rate" numeric(5, 2),
	"default_bank_account_id" uuid,
	"default_template_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "company_settings_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "company_default_vat" CHECK ("company_settings"."default_vat_rate" is null or "company_settings"."default_vat_rate" between 0 and 100),
	CONSTRAINT "company_singleton" CHECK ("company_settings"."id" = 1),
	CONSTRAINT "company_locale" CHECK ("company_settings"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "company_capital" CHECK ("company_settings"."share_capital" is null or "company_settings"."share_capital" >= 0),
	CONSTRAINT "company_rc_pair" CHECK (("company_settings"."registration_number" is null) = ("company_settings"."registration_city" is null)),
	CONSTRAINT "company_ice" CHECK ("company_settings"."ice" is null or "company_settings"."ice" ~ '^[0-9]{15}$'),
	CONSTRAINT "company_days" CHECK ("company_settings"."payment_due_days" between 0 and 3650 and "company_settings"."estimate_valid_days" between 0 and 3650),
	CONSTRAINT "company_version" CHECK ("company_settings"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "company_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_templates" (
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"layout" text DEFAULT 'classic' NOT NULL,
	"density" text DEFAULT 'standard' NOT NULL,
	"accent_color" text DEFAULT '#ad7d1d' NOT NULL,
	"logo_asset_id" uuid,
	"signature_asset_id" uuid,
	"show_bank_details" boolean DEFAULT true NOT NULL,
	"show_signature" boolean DEFAULT false NOT NULL,
	"show_payment_terms" boolean DEFAULT true NOT NULL,
	"footer_text" text,
	"payment_terms" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_id" uuid,
	"updated_by_actor_id" uuid,
	CONSTRAINT "template_layout" CHECK ("document_templates"."layout" in ('classic','modern','minimal','signature','atelier','ledger','essential')),
	CONSTRAINT "template_density" CHECK ("document_templates"."density" in ('standard','compact')),
	CONSTRAINT "template_color" CHECK ("document_templates"."accent_color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "template_version" CHECK ("document_templates"."version" > 0)
);

--> statement-breakpoint

ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "staff_invitation_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"role_id" uuid
);

--> statement-breakpoint

ALTER TABLE "staff_invitation_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid DEFAULT nullif(current_setting('app.organization_id', true), '')::uuid NOT NULL,
	"email" text NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"invited_by" uuid,
	"accepted_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"delivery_state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitation_email_normalized" CHECK ("staff_invitations"."email"=lower(trim("staff_invitations"."email"))),
	CONSTRAINT "staff_invitation_status" CHECK ("staff_invitations"."status" in ('pending','accepted','revoked')),
	CONSTRAINT "staff_invitation_language" CHECK ("staff_invitations"."language" in ('fr','en')),
	CONSTRAINT "staff_invitation_delivery_state" CHECK ("staff_invitations"."delivery_state" in ('queued','sending','sent','failed','cancelled')),
	CONSTRAINT "staff_invitation_attempts" CHECK ("staff_invitations"."attempts" between 0 and 5)
);

--> statement-breakpoint

ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"tax_rate_basis_points" integer,
	"payment_methods" text[] DEFAULT '{bank_transfer,cash}'::text[] NOT NULL,
	"payment_instructions" text DEFAULT '' NOT NULL,
	CONSTRAINT "billing_settings_singleton" CHECK ("billing_settings"."id"=1),
	CONSTRAINT "billing_settings_tax" CHECK ("billing_settings"."tax_rate_basis_points" is null or "billing_settings"."tax_rate_basis_points" between 0 and 10000)
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "owner_subscriptions" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"trial_started_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"paid_through_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trial_window" CHECK ("owner_subscriptions"."trial_ends_at"="owner_subscriptions"."trial_started_at"+interval '7 days')
);

--> statement-breakpoint

ALTER TABLE "owner_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscription_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"message_key" text NOT NULL,
	"recipients" integer NOT NULL,
	"allowance_key" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_emails_message_key_unique" UNIQUE("message_key"),
	CONSTRAINT "subscription_email_recipients" CHECK ("subscription_emails"."recipients">0)
);

--> statement-breakpoint

ALTER TABLE "subscription_emails" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"cycle" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"method" text NOT NULL,
	"reference" text NOT NULL,
	"currency" text NOT NULL,
	"amount_ht" integer NOT NULL,
	"tax_rate_basis_points" integer,
	"tax_amount" integer NOT NULL,
	"amount_ttc" integer NOT NULL,
	"coverage_start" timestamp with time zone,
	"coverage_end" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"received_reference" text,
	"rejection_reason" text,
	CONSTRAINT "subscription_payment_amounts" CHECK ("subscription_payments"."amount_ht">=0 and "subscription_payments"."tax_amount">=0 and "subscription_payments"."amount_ttc"="subscription_payments"."amount_ht"+"subscription_payments"."tax_amount"),
	CONSTRAINT "subscription_payment_coverage" CHECK (("subscription_payments"."status"='confirmed')=("subscription_payments"."coverage_start" is not null and "subscription_payments"."coverage_end">"subscription_payments"."coverage_start")),
	CONSTRAINT "subscription_payment_reference" CHECK (btrim("subscription_payments"."reference")<>''),
	CONSTRAINT "subscription_payment_rejection_reason" CHECK (("subscription_payments"."status"='rejected')=("subscription_payments"."rejection_reason" is not null and btrim("subscription_payments"."rejection_reason")<>''))
);

--> statement-breakpoint

ALTER TABLE "subscription_payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscription_plans" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"entitlements" jsonb NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"monthly_ht" integer DEFAULT 0 NOT NULL,
	"annual_ht" integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscription_storage" (
	"object_key" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"stored" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"touched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_storage_size" CHECK ("subscription_storage"."byte_size">0)
);

--> statement-breakpoint

ALTER TABLE "subscription_storage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "platform_admin_audit_created_idx" ON "platform_admin_audit" USING btree ("created_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "platform_admin_sessions_token_unique" ON "platform_admin_sessions" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "platform_admin_sessions_admin_idx" ON "platform_admin_sessions" USING btree ("admin_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_unique" ON "platform_admins" USING btree ("email");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "document_artifacts_objectKey_tenant_unique" ON "document_artifacts" USING btree ("organization_id","object_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "document_artifacts_owner_version_format_uq" ON "document_artifacts" USING btree ("organization_id","document_type","document_id","source_version","format");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_artifacts_owner_idx" ON "document_artifacts" USING btree ("organization_id","document_type","document_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_tenant_unique" ON "password_reset_tokens" USING btree ("organization_id","token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("organization_id","user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "permissions_key_unique" ON "permissions" USING btree ("key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "roles_organization_key_unique" ON "roles" USING btree ("organization_id","key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "roles_organization_id_unique" ON "roles" USING btree ("organization_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("organization_id","user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles" USING btree ("organization_id","role_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "users_organization_email_unique" ON "users" USING btree ("organization_id","email");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "users_organization_id_unique" ON "users" USING btree ("organization_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_normalized_name_unique" ON "product_categories" USING btree ("organization_id",lower(trim("name")));
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_weight_unique" ON "product_variants" USING btree ("organization_id","product_id","weight_g");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "product_variants_product_idx" ON "product_variants" USING btree ("organization_id","product_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "products_reference_unique" ON "products" USING btree ("organization_id",lower(trim("reference")));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" USING btree ("organization_id","category_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "clients_type_status_idx" ON "clients" USING btree ("organization_id","type","archived_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "clients_email_idx" ON "clients" USING btree ("organization_id","email");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "delivery_invoice_allocations_delivery_idx" ON "delivery_invoice_allocations" USING btree ("organization_id","delivery_note_line_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_note_lines_position_uq" ON "delivery_note_lines" USING btree ("organization_id","delivery_note_id","position");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "delivery_note_lines_source_invoice_idx" ON "delivery_note_lines" USING btree ("organization_id","source_invoice_line_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_notes_number_tenant_unique" ON "delivery_notes" USING btree ("organization_id","number");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "delivery_notes_client_status_idx" ON "delivery_notes" USING btree ("organization_id","client_id","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("organization_id","invoice_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "estimate_lines_position_uq" ON "estimate_lines" USING btree ("organization_id","estimate_id","position");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "estimate_lines_product_idx" ON "estimate_lines" USING btree ("organization_id","product_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "estimates_number_tenant_unique" ON "estimates" USING btree ("organization_id","number");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "estimates_revision_of_uq" ON "estimates" USING btree ("organization_id","revision_of_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "estimates_client_status_idx" ON "estimates" USING btree ("organization_id","client_id","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "estimates_issue_date_idx" ON "estimates" USING btree ("organization_id","issue_date");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_lines_position_uq" ON "invoice_lines" USING btree ("organization_id","invoice_id","position");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoice_lines_product_idx" ON "invoice_lines" USING btree ("organization_id","product_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_number_tenant_unique" ON "invoices" USING btree ("organization_id","number");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_conversionOperationId_tenant_unique" ON "invoices" USING btree ("organization_id","conversion_operation_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoices_client_status_idx" ON "invoices" USING btree ("organization_id","client_id","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoices_source_estimate_idx" ON "invoices" USING btree ("organization_id","source_estimate_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "background_jobs_idempotencyKey_tenant_unique" ON "background_jobs" USING btree ("organization_id","idempotency_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_claim_idx" ON "background_jobs" USING btree ("organization_id","status","available_at","locked_until");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "media_assets_objectKey_tenant_unique" ON "media_assets" USING btree ("organization_id","object_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "media_cleanup_idx" ON "media_assets" USING btree ("organization_id","status","expires_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_messageId_tenant_unique" ON "notification_dispatches" USING btree ("organization_id","message_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_occurrence_uq" ON "notification_dispatches" USING btree ("organization_id","source_type","source_id","event_key","occurrence_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_logical_uq" ON "notification_dispatches" USING btree ("organization_id","source_type","source_id","event_key","logical_occurrence_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_dispatches_source_idx" ON "notification_dispatches" USING btree ("organization_id","source_type","source_id","created_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_rules_eventKey_tenant_unique" ON "notification_rules" USING btree ("organization_id","event_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "outbound_message_attachments_position_uq" ON "outbound_message_attachments" USING btree ("organization_id","message_id","position");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outbound_message_attachments_key_idx" ON "outbound_message_attachments" USING btree ("organization_id","object_key");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "outbound_messages_idempotencyKey_tenant_unique" ON "outbound_messages" USING btree ("organization_id","idempotency_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outbound_messages_claim_idx" ON "outbound_messages" USING btree ("organization_id","status","available_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outbound_messages_lease_idx" ON "outbound_messages" USING btree ("organization_id","status","locked_until");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "outbound_messages_provider_idx" ON "outbound_messages" USING btree ("organization_id","provider_message_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "organization_domains_hostname_unique" ON "organization_domains" USING btree ("hostname");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "organization_domains_organization_idx" ON "organization_domains" USING btree ("organization_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "organization_domains_active_unique" ON "organization_domains" USING btree ("organization_id") WHERE "organization_domains"."activated_at" is not null;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_unique" ON "organizations" USING btree ("slug");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "organizations_owner_idx" ON "organizations" USING btree ("owner_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "owner_account_tokens_hash_unique" ON "owner_account_tokens" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "owner_account_tokens_owner_idx" ON "owner_account_tokens" USING btree ("owner_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "owner_sessions_token_unique" ON "owner_sessions" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "owner_sessions_owner_idx" ON "owner_sessions" USING btree ("owner_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_unique" ON "platform_users" USING btree ("email");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payments_number_tenant_unique" ON "payments" USING btree ("organization_id","number");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payments_operationId_tenant_unique" ON "payments" USING btree ("organization_id","operation_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payments_invoice_status_idx" ON "payments" USING btree ("organization_id","invoice_id","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payments_collection_idx" ON "payments" USING btree ("organization_id","collected_on","status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payments_cheque_identity_idx" ON "payments" USING btree ("organization_id","cheque_bank","cheque_number") WHERE "payments"."status" <> 'cancelled' and "payments"."method" = 'cheque';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "report_runs_occurrence_uq" ON "report_runs" USING btree ("organization_id","schedule_id","scheduled_for") WHERE "report_runs"."trigger" = 'scheduled';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "report_runs_retry_idx" ON "report_runs" USING btree ("organization_id","status","next_attempt_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "report_runs_lease_idx" ON "report_runs" USING btree ("locked_until") WHERE "report_runs"."status"='running';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "report_schedule_recipients_user_idx" ON "report_schedule_recipients" USING btree ("organization_id","user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "report_schedules_due_idx" ON "report_schedules" USING btree ("next_run_at") WHERE "report_schedules"."enabled" and "report_schedules"."archived_at" is null;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitation_role_unique" ON "staff_invitation_roles" USING btree ("invitation_id","role_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitation_pending_email" ON "staff_invitations" USING btree ("organization_id","email") WHERE "staff_invitations"."status"='pending';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitation_token_hash" ON "staff_invitations" USING btree ("organization_id","token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscription_emails_owner_period" ON "subscription_emails" USING btree ("owner_id","queued_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_one_open" ON "subscription_payments" USING btree ("owner_id") WHERE "subscription_payments"."status"='submitted';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscription_payments_owner" ON "subscription_payments" USING btree ("owner_id","submitted_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "subscription_storage_owner" ON "subscription_storage" USING btree ("owner_id");
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "actors" ADD CONSTRAINT "actors_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "actors" ADD CONSTRAINT "actors_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "platform_admin_audit" ADD CONSTRAINT "platform_admin_audit_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "platform_admin_sessions" ADD CONSTRAINT "platform_admin_sessions_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_organization_user_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users"("organization_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_user_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users"("organization_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_actor_id_actors_id_fk" FOREIGN KEY ("assigned_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_invoice_allocations" ADD CONSTRAINT "delivery_invoice_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_invoice_allocations" ADD CONSTRAINT "delivery_invoice_allocations_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_invoice_allocations" ADD CONSTRAINT "delivery_invoice_allocations_delivery_note_line_id_delivery_note_lines_id_fk" FOREIGN KEY ("delivery_note_line_id") REFERENCES "public"."delivery_note_lines"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_delivery_note_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_note_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_source_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("source_invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_revision_of_id_estimates_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "public"."estimates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_product_variant_id_product_variants_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_estimate_id_estimates_id_fk" FOREIGN KEY ("source_estimate_id") REFERENCES "public"."estimates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_initiated_by_actor_id_actors_id_fk" FOREIGN KEY ("initiated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_actors_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_brand_assets" ADD CONSTRAINT "organization_brand_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_rule_id_notification_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."notification_rules"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_message_id_outbound_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."outbound_messages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "outbound_message_attachments" ADD CONSTRAINT "outbound_message_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "outbound_message_attachments" ADD CONSTRAINT "outbound_message_attachments_message_id_outbound_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."outbound_messages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_admin_deliveries" ADD CONSTRAINT "organization_admin_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_admin_deliveries" ADD CONSTRAINT "organization_admin_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "owner_account_tokens" ADD CONSTRAINT "owner_account_tokens_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_user_id_actors_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_default_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("default_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_default_template_id_document_templates_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
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

DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_updated_by_actor_id_actors_id_fk" FOREIGN KEY ("updated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitation_roles" ADD CONSTRAINT "staff_invitation_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitation_roles" ADD CONSTRAINT "staff_invitation_roles_invitation_id_staff_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."staff_invitations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitation_roles" ADD CONSTRAINT "staff_invitation_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_plan_code_subscription_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."subscription_plans"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "subscription_emails" ADD CONSTRAINT "subscription_emails_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_plan_code_subscription_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."subscription_plans"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "subscription_storage" ADD CONSTRAINT "subscription_storage_owner_id_platform_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."platform_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

CREATE POLICY "actor_scope" ON "actors" AS PERMISSIVE FOR ALL TO public USING (("actors"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and (o.owner_id="actors"."owner_id" or exists(select 1 from users u where u.id="actors"."staff_id" and u.organization_id=o.id)))) WITH CHECK (("actors"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and (o.owner_id="actors"."owner_id" or exists(select 1 from users u where u.id="actors"."staff_id" and u.organization_id=o.id))));
--> statement-breakpoint

CREATE POLICY "platform_admin_audit_read" ON "platform_admin_audit" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "platform_admin_audit_insert" ON "platform_admin_audit" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "platform_admin_sessions_admin_only" ON "platform_admin_sessions" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='platform_admin') WITH CHECK (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "platform_admins_admin_only" ON "platform_admins" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='platform_admin') WITH CHECK (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "document_artifacts" AS PERMISSIVE FOR ALL TO public USING ("document_artifacts"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("document_artifacts"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "password_reset_tokens" AS PERMISSIVE FOR ALL TO public USING ("password_reset_tokens"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("password_reset_tokens"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "role_permissions" AS PERMISSIVE FOR ALL TO public USING ("role_permissions"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("role_permissions"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "roles" AS PERMISSIVE FOR ALL TO public USING ("roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "sessions" AS PERMISSIVE FOR ALL TO public USING ("sessions"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("sessions"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "user_roles" AS PERMISSIVE FOR ALL TO public USING ("user_roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("user_roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "user_settings" AS PERMISSIVE FOR ALL TO public USING ("user_settings"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("user_settings"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("users"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "product_categories" AS PERMISSIVE FOR ALL TO public USING ("product_categories"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("product_categories"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "product_variants" AS PERMISSIVE FOR ALL TO public USING ("product_variants"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("product_variants"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "products" AS PERMISSIVE FOR ALL TO public USING ("products"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("products"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "clients" AS PERMISSIVE FOR ALL TO public USING ("clients"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("clients"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "delivery_invoice_allocations" AS PERMISSIVE FOR ALL TO public USING ("delivery_invoice_allocations"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("delivery_invoice_allocations"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "delivery_note_lines" AS PERMISSIVE FOR ALL TO public USING ("delivery_note_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("delivery_note_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "delivery_notes" AS PERMISSIVE FOR ALL TO public USING ("delivery_notes"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("delivery_notes"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "estimate_lines" AS PERMISSIVE FOR ALL TO public USING ("estimate_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("estimate_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "estimates" AS PERMISSIVE FOR ALL TO public USING ("estimates"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("estimates"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoice_lines" AS PERMISSIVE FOR ALL TO public USING ("invoice_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("invoice_lines"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO public USING ("invoices"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("invoices"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "background_jobs" AS PERMISSIVE FOR ALL TO public USING ("background_jobs"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("background_jobs"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "media_assets" AS PERMISSIVE FOR ALL TO public USING ("media_assets"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("media_assets"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "organization_brand_owner" ON "organization_brand_assets" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id="organization_brand_assets"."organization_id" and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)) WITH CHECK (current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id="organization_brand_assets"."organization_id" and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid));
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "client_notification_preferences" AS PERMISSIVE FOR ALL TO public USING ("client_notification_preferences"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("client_notification_preferences"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "notification_dispatches" AS PERMISSIVE FOR ALL TO public USING ("notification_dispatches"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("notification_dispatches"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "notification_rules" AS PERMISSIVE FOR ALL TO public USING ("notification_rules"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("notification_rules"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "outbound_message_attachments" AS PERMISSIVE FOR ALL TO public USING ("outbound_message_attachments"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("outbound_message_attachments"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "outbound_messages" AS PERMISSIVE FOR ALL TO public USING ("outbound_messages"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("outbound_messages"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "organization_profile_owner" ON "organization_profiles" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id="organization_profiles"."organization_id" and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)) WITH CHECK (current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id="organization_profiles"."organization_id" and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid));
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "organization_admin_deliveries" AS PERMISSIVE FOR ALL TO public USING ("organization_admin_deliveries"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_admin_deliveries"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "organization_domains_tenant_scope" ON "organization_domains" AS PERMISSIVE FOR ALL TO public USING ("organization_domains"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_domains"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "organizations_platform_admin_read" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "organizations_worker_discovery" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.actor_type',true)='worker');
--> statement-breakpoint

CREATE POLICY "organizations_owner_portal_update" ON "organizations" AS PERMISSIVE FOR UPDATE TO public USING (current_setting('app.actor_type',true)='owner' and "organizations"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (current_setting('app.actor_type',true)='owner' and "organizations"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid);
--> statement-breakpoint

CREATE POLICY "organizations_owner_portal_insert" ON "organizations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (current_setting('app.actor_type',true)='owner' and "organizations"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid);
--> statement-breakpoint

CREATE POLICY "organizations_owner_portal_read" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.actor_type', true) = 'owner' and "organizations"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "organizations_tenant_scope" ON "organizations" AS PERMISSIVE FOR ALL TO public USING ("organizations"."id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizations"."id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "payments" AS PERMISSIVE FOR ALL TO public USING ("payments"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("payments"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "report_runs" AS PERMISSIVE FOR ALL TO public USING ("report_runs"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("report_runs"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "report_schedule_recipients" AS PERMISSIVE FOR ALL TO public USING ("report_schedule_recipients"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("report_schedule_recipients"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "report_schedules" AS PERMISSIVE FOR ALL TO public USING ("report_schedules"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("report_schedules"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "audit_events" AS PERMISSIVE FOR ALL TO public USING ("audit_events"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("audit_events"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "bank_accounts" AS PERMISSIVE FOR ALL TO public USING ("bank_accounts"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("bank_accounts"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "company_settings" AS PERMISSIVE FOR ALL TO public USING ("company_settings"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("company_settings"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "document_templates" AS PERMISSIVE FOR ALL TO public USING ("document_templates"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("document_templates"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "staff_invitation_roles" AS PERMISSIVE FOR ALL TO public USING ("staff_invitation_roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("staff_invitation_roles"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "staff_invitations" AS PERMISSIVE FOR ALL TO public USING ("staff_invitations"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("staff_invitations"."organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "subscription_worker_read" ON "owner_subscriptions" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.actor_type',true)='worker');
--> statement-breakpoint

CREATE POLICY "subscription_admin" ON "owner_subscriptions" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='platform_admin') WITH CHECK (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "subscription_scope" ON "owner_subscriptions" AS PERMISSIVE FOR ALL TO public USING (("owner_subscriptions"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id="owner_subscriptions"."owner_id")) WITH CHECK (("owner_subscriptions"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id="owner_subscriptions"."owner_id"));
--> statement-breakpoint

CREATE POLICY "usage_owner" ON "subscription_emails" AS PERMISSIVE FOR ALL TO public USING ("subscription_emails"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') WITH CHECK ("subscription_emails"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner');
--> statement-breakpoint

CREATE POLICY "subscription_payment_owner" ON "subscription_payments" AS PERMISSIVE FOR SELECT TO public USING (("subscription_payments"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id="subscription_payments"."owner_id"));
--> statement-breakpoint

CREATE POLICY "subscription_payment_owner_submit" ON "subscription_payments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("subscription_payments"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner');
--> statement-breakpoint

CREATE POLICY "subscription_payment_admin" ON "subscription_payments" AS PERMISSIVE FOR ALL TO public USING (current_setting('app.actor_type',true)='platform_admin') WITH CHECK (current_setting('app.actor_type',true)='platform_admin');
--> statement-breakpoint

CREATE POLICY "usage_owner" ON "subscription_storage" AS PERMISSIVE FOR ALL TO public USING ("subscription_storage"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') WITH CHECK ("subscription_storage"."owner_id"=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner');
--> statement-breakpoint
ALTER TABLE "actors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admin_audit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admin_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admins" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_artifacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "delivery_invoice_allocations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "delivery_note_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "delivery_notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estimate_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estimates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "background_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_brand_assets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_notification_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_dispatches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_rules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbound_message_attachments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbound_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_admin_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organization_domains" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_schedule_recipients" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_schedules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_invitation_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscription_emails" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscription_payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscription_storage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_d7b5c742ff8d4ced" ON "users" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_574882d3a4521890" ON "roles" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_6c4ead0276e7b9e3" ON "products" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_5114e86a30dee11e" ON "product_categories" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_4dc7358f9e16f7b9" ON "media_assets" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_a3c56ac6556d9ae4" ON "invoice_lines" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_1b105028533b975c" ON "delivery_note_lines" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_527360eb5be6c3b4" ON "delivery_notes" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_3b3d69106de3a587" ON "product_variants" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_b39824b4cc004237" ON "clients" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_34f0f6681a2a468e" ON "invoices" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_098c2eb8faebc39b" ON "document_templates" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_cd203edc8e55d697" ON "estimates" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_7d944ad0c516a1b5" ON "bank_accounts" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_c4b8ae4d2e2dea92" ON "notification_rules" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_29e9c5964dcd6378" ON "outbound_messages" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_b4bd49085acdbbca" ON "report_schedules" ("organization_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_key_36281e9e595c6016" ON "staff_invitations" ("organization_id","id");
--> statement-breakpoint
-- Tenant relationship: password_reset_tokens_user_id_users_id_fk
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "tenant_fk_daa080d0c465d367" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: role_permissions_role_id_roles_id_fk
ALTER TABLE "role_permissions" ADD CONSTRAINT "tenant_fk_557ec4ba82a964b3" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: sessions_user_id_users_id_fk
ALTER TABLE "sessions" ADD CONSTRAINT "tenant_fk_ea4198c94f540802" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: user_roles_user_id_users_id_fk
ALTER TABLE "user_roles" ADD CONSTRAINT "tenant_fk_ff6d251ba237c6ee" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: user_roles_role_id_roles_id_fk
ALTER TABLE "user_roles" ADD CONSTRAINT "tenant_fk_02bd83fe060ce3a7" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: user_settings_user_id_users_id_fk
ALTER TABLE "user_settings" ADD CONSTRAINT "tenant_fk_b2465f8367a183c8" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: product_variants_product_id_products_id_fk
ALTER TABLE "product_variants" ADD CONSTRAINT "tenant_fk_7a12201a53abf9a4" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: products_category_id_product_categories_id_fk
ALTER TABLE "products" ADD CONSTRAINT "tenant_fk_f2a2d3294fc7fae6" FOREIGN KEY ("organization_id","category_id") REFERENCES "public"."product_categories" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: products_image_asset_id_media_assets_id_fk
ALTER TABLE "products" ADD CONSTRAINT "tenant_fk_59ae671e91ea321c" FOREIGN KEY ("organization_id","image_asset_id") REFERENCES "public"."media_assets" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_invoice_allocations_invoice_line_id_invoice_lines_id_fk
ALTER TABLE "delivery_invoice_allocations" ADD CONSTRAINT "tenant_fk_deb0b9f635021465" FOREIGN KEY ("organization_id","invoice_line_id") REFERENCES "public"."invoice_lines" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_invoice_allocations_delivery_note_line_id_delivery_note_lines_id_fk
ALTER TABLE "delivery_invoice_allocations" ADD CONSTRAINT "tenant_fk_f91167923f3ae966" FOREIGN KEY ("organization_id","delivery_note_line_id") REFERENCES "public"."delivery_note_lines" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_note_lines_delivery_note_id_delivery_notes_id_fk
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "tenant_fk_43808c823c4e8289" FOREIGN KEY ("organization_id","delivery_note_id") REFERENCES "public"."delivery_notes" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_note_lines_product_id_products_id_fk
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "tenant_fk_3559af9b77c03975" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_note_lines_product_variant_id_product_variants_id_fk
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "tenant_fk_f00ef931082607b4" FOREIGN KEY ("organization_id","product_variant_id") REFERENCES "public"."product_variants" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_note_lines_source_invoice_line_id_invoice_lines_id_fk
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "tenant_fk_07fbea8682df5cf1" FOREIGN KEY ("organization_id","source_invoice_line_id") REFERENCES "public"."invoice_lines" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_notes_client_id_clients_id_fk
ALTER TABLE "delivery_notes" ADD CONSTRAINT "tenant_fk_bce57c63d8627d22" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_notes_invoice_id_invoices_id_fk
ALTER TABLE "delivery_notes" ADD CONSTRAINT "tenant_fk_57094d3738952e17" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: delivery_notes_template_id_document_templates_id_fk
ALTER TABLE "delivery_notes" ADD CONSTRAINT "tenant_fk_fa8ce3ad1016f334" FOREIGN KEY ("organization_id","template_id") REFERENCES "public"."document_templates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimate_lines_estimate_id_estimates_id_fk
ALTER TABLE "estimate_lines" ADD CONSTRAINT "tenant_fk_412c5b0ad81c7000" FOREIGN KEY ("organization_id","estimate_id") REFERENCES "public"."estimates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimate_lines_product_id_products_id_fk
ALTER TABLE "estimate_lines" ADD CONSTRAINT "tenant_fk_13ca4ee7ab34f6e6" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimate_lines_product_variant_id_product_variants_id_fk
ALTER TABLE "estimate_lines" ADD CONSTRAINT "tenant_fk_8855c8ce689237be" FOREIGN KEY ("organization_id","product_variant_id") REFERENCES "public"."product_variants" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimates_revision_of_id_estimates_id_fk
ALTER TABLE "estimates" ADD CONSTRAINT "tenant_fk_dc4cbfec07b7fcf6" FOREIGN KEY ("organization_id","revision_of_id") REFERENCES "public"."estimates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimates_client_id_clients_id_fk
ALTER TABLE "estimates" ADD CONSTRAINT "tenant_fk_63c9eec3a5c41f45" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimates_template_id_document_templates_id_fk
ALTER TABLE "estimates" ADD CONSTRAINT "tenant_fk_c33dfd94deed0c7f" FOREIGN KEY ("organization_id","template_id") REFERENCES "public"."document_templates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: estimates_bank_account_id_bank_accounts_id_fk
ALTER TABLE "estimates" ADD CONSTRAINT "tenant_fk_0c008236b91a269a" FOREIGN KEY ("organization_id","bank_account_id") REFERENCES "public"."bank_accounts" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoice_lines_invoice_id_invoices_id_fk
ALTER TABLE "invoice_lines" ADD CONSTRAINT "tenant_fk_795c1e6ff061b681" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoice_lines_product_id_products_id_fk
ALTER TABLE "invoice_lines" ADD CONSTRAINT "tenant_fk_79797b62dca636ad" FOREIGN KEY ("organization_id","product_id") REFERENCES "public"."products" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoice_lines_product_variant_id_product_variants_id_fk
ALTER TABLE "invoice_lines" ADD CONSTRAINT "tenant_fk_22cf366311f17ae7" FOREIGN KEY ("organization_id","product_variant_id") REFERENCES "public"."product_variants" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoices_client_id_clients_id_fk
ALTER TABLE "invoices" ADD CONSTRAINT "tenant_fk_6c525d7fadef114d" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoices_template_id_document_templates_id_fk
ALTER TABLE "invoices" ADD CONSTRAINT "tenant_fk_7ffa65b6ec37b469" FOREIGN KEY ("organization_id","template_id") REFERENCES "public"."document_templates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoices_source_estimate_id_estimates_id_fk
ALTER TABLE "invoices" ADD CONSTRAINT "tenant_fk_29ff039c027eafdd" FOREIGN KEY ("organization_id","source_estimate_id") REFERENCES "public"."estimates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: invoices_bank_account_id_bank_accounts_id_fk
ALTER TABLE "invoices" ADD CONSTRAINT "tenant_fk_1254be3ab25a8471" FOREIGN KEY ("organization_id","bank_account_id") REFERENCES "public"."bank_accounts" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: client_notification_preferences_client_id_clients_id_fk
ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "tenant_fk_9137c52562dee5fc" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: client_notification_preferences_rule_id_notification_rules_id_fk
ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "tenant_fk_e12f54d211955942" FOREIGN KEY ("organization_id","rule_id") REFERENCES "public"."notification_rules" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: notification_dispatches_message_id_outbound_messages_id_fk
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "tenant_fk_d678752f81197414" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."outbound_messages" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: outbound_message_attachments_message_id_outbound_messages_id_fk
ALTER TABLE "outbound_message_attachments" ADD CONSTRAINT "tenant_fk_a749ae04cf1ef965" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."outbound_messages" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: organization_admin_deliveries_user_id_users_id_fk
ALTER TABLE "organization_admin_deliveries" ADD CONSTRAINT "tenant_fk_ed83280c9cfd7182" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: payments_invoice_id_invoices_id_fk
ALTER TABLE "payments" ADD CONSTRAINT "tenant_fk_b464e135417408b5" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: payments_bank_account_id_bank_accounts_id_fk
ALTER TABLE "payments" ADD CONSTRAINT "tenant_fk_a6136b58669c80cd" FOREIGN KEY ("organization_id","bank_account_id") REFERENCES "public"."bank_accounts" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: report_runs_schedule_id_report_schedules_id_fk
ALTER TABLE "report_runs" ADD CONSTRAINT "tenant_fk_d2d221454b932d7b" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "public"."report_schedules" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: report_schedule_recipients_schedule_id_report_schedules_id_fk
ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "tenant_fk_e18db7746189adee" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "public"."report_schedules" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: company_settings_logo_asset_id_media_assets_id_fk
ALTER TABLE "company_settings" ADD CONSTRAINT "tenant_fk_482d8b2e198cd359" FOREIGN KEY ("organization_id","logo_asset_id") REFERENCES "public"."media_assets" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: company_settings_default_bank_account_id_bank_accounts_id_fk
ALTER TABLE "company_settings" ADD CONSTRAINT "tenant_fk_3289892ef10f42df" FOREIGN KEY ("organization_id","default_bank_account_id") REFERENCES "public"."bank_accounts" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: company_settings_default_template_id_document_templates_id_fk
ALTER TABLE "company_settings" ADD CONSTRAINT "tenant_fk_b73e06608c39038c" FOREIGN KEY ("organization_id","default_template_id") REFERENCES "public"."document_templates" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: document_templates_logo_asset_id_media_assets_id_fk
ALTER TABLE "document_templates" ADD CONSTRAINT "tenant_fk_204a02ddc061e469" FOREIGN KEY ("organization_id","logo_asset_id") REFERENCES "public"."media_assets" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: document_templates_signature_asset_id_media_assets_id_fk
ALTER TABLE "document_templates" ADD CONSTRAINT "tenant_fk_d92e6e50f4ec8646" FOREIGN KEY ("organization_id","signature_asset_id") REFERENCES "public"."media_assets" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: staff_invitation_roles_invitation_id_staff_invitations_id_fk
ALTER TABLE "staff_invitation_roles" ADD CONSTRAINT "tenant_fk_fa07efa1fb0e3edd" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "public"."staff_invitations" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: staff_invitation_roles_role_id_roles_id_fk
ALTER TABLE "staff_invitation_roles" ADD CONSTRAINT "tenant_fk_b0457b00e60f4f3e" FOREIGN KEY ("organization_id","role_id") REFERENCES "public"."roles" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: staff_invitations_invited_by_users_id_fk
ALTER TABLE "staff_invitations" ADD CONSTRAINT "tenant_fk_a8e045b34bfdfc69" FOREIGN KEY ("organization_id","invited_by") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- Tenant relationship: staff_invitations_accepted_user_id_users_id_fk
ALTER TABLE "staff_invitations" ADD CONSTRAINT "tenant_fk_3d50a335731a8eb3" FOREIGN KEY ("organization_id","accepted_user_id") REFERENCES "public"."users" ("organization_id","id") ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
  ('bank_accounts.create', 'Create bank accounts'),
  ('bank_accounts.delete', 'Permanently delete bank accounts when allowed'),
  ('bank_accounts.read', 'View bank accounts and download existing documents'),
  ('bank_accounts.update', 'Edit bank accounts and change their state'),
  ('categories.create', 'Create categories'),
  ('categories.delete', 'Permanently delete categories when allowed'),
  ('categories.read', 'View categories and download existing documents'),
  ('categories.update', 'Edit categories and change their state'),
  ('client_notification_preferences.read', 'View client notification preferences and download existing documents'),
  ('client_notification_preferences.update', 'Edit client notification preferences and change their state'),
  ('clients.create', 'Create clients'),
  ('clients.delete', 'Permanently delete clients when allowed'),
  ('clients.read', 'View clients and download existing documents'),
  ('clients.update', 'Edit clients and change their state'),
  ('company_settings.read', 'View company settings and download existing documents'),
  ('company_settings.update', 'Edit company settings and change their state'),
  ('delivery_notes.create', 'Create delivery notes'),
  ('delivery_notes.delete', 'Permanently delete delivery notes when allowed'),
  ('delivery_notes.read', 'View delivery notes and download existing documents'),
  ('delivery_notes.update', 'Edit delivery notes and change their state'),
  ('estimates.create', 'Create estimates'),
  ('estimates.delete', 'Permanently delete estimates when allowed'),
  ('estimates.read', 'View estimates and download existing documents'),
  ('estimates.update', 'Edit estimates and change their state'),
  ('invoices.create', 'Create invoices'),
  ('invoices.delete', 'Permanently delete invoices when allowed'),
  ('invoices.read', 'View invoices and download existing documents'),
  ('invoices.update', 'Edit invoices and change their state'),
  ('notification_dispatches.read', 'View notification dispatches and download existing documents'),
  ('notification_dispatches.update', 'Edit notification dispatches and change their state'),
  ('notification_rules.read', 'View notification rules and download existing documents'),
  ('notification_rules.update', 'Edit notification rules and change their state'),
  ('payments.create', 'Create payments'),
  ('payments.delete', 'Permanently delete payments when allowed'),
  ('payments.read', 'View payments and download existing documents'),
  ('payments.update', 'Edit payments and change their state'),
  ('products.create', 'Create products'),
  ('products.delete', 'Permanently delete products when allowed'),
  ('products.read', 'View products and download existing documents'),
  ('products.update', 'Edit products and change their state'),
  ('reports.read', 'Access all reports, exports and scheduled reports'),
  ('roles.create', 'Create roles'),
  ('roles.delete', 'Permanently delete roles when allowed'),
  ('roles.read', 'View roles and download existing documents'),
  ('roles.update', 'Edit roles and change their state'),
  ('staff.create', 'Create staff'),
  ('staff.delete', 'Permanently delete unused staff accounts'),
  ('staff.read', 'View staff and download existing documents'),
  ('staff.update', 'Edit staff and change their state'),
  ('templates.create', 'Create templates'),
  ('templates.delete', 'Permanently delete templates when allowed'),
  ('templates.read', 'View templates and download existing documents'),
  ('templates.update', 'Edit templates and change their state')
ON CONFLICT DO NOTHING;

--> statement-breakpoint
INSERT INTO subscription_plans(code,name,rank,monthly_ht,annual_ht,entitlements) VALUES
('trial','Essai gratuit 7 jours',0,0,0,'{"organizations":1,"staffPerOrganization":2,"storageBytes":1000000000,"businessEmails":50,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}'),
('essential','Essential',1,9900,99000,'{"organizations":1,"staffPerOrganization":1,"storageBytes":1000000000,"businessEmails":0,"features":[]}'),
('business','Business',2,29900,299000,'{"organizations":3,"staffPerOrganization":5,"storageBytes":10000000000,"businessEmails":2000,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}'),
('pro','Pro',3,79900,799000,'{"organizations":null,"staffPerOrganization":null,"storageBytes":50000000000,"businessEmails":10000,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}');
--> statement-breakpoint
INSERT INTO billing_settings(id) VALUES (1);

--> statement-breakpoint
CREATE FUNCTION lock_variant_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent_id := OLD.product_id;
  ELSE parent_id := NEW.product_id;
  END IF;
  PERFORM 1 FROM products WHERE id = parent_id FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.product_id <> NEW.product_id THEN
      PERFORM 1 FROM products WHERE id = OLD.product_id FOR UPDATE;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variant_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON product_variants
FOR EACH ROW EXECUTE FUNCTION lock_variant_product();
--> statement-breakpoint
CREATE FUNCTION assert_product_has_active_variant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN parent_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN parent_id := OLD.product_id;
  ELSE parent_id := NEW.product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE id = parent_id)
     AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = parent_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'A product requires at least one active variant' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'product_variants' AND TG_OP = 'UPDATE' THEN
    IF OLD.product_id <> NEW.product_id
       AND EXISTS (SELECT 1 FROM products WHERE id = OLD.product_id)
       AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = OLD.product_id AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'A product requires at least one active variant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER product_requires_variant_after_create AFTER INSERT ON products
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_product_has_active_variant();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER product_requires_variant_after_change AFTER INSERT OR UPDATE OR DELETE ON product_variants
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_product_has_active_variant();
--> statement-breakpoint
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
CREATE FUNCTION enforce_staff_scope_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_staff_uuid uuid;
DECLARE affected_role_uuid uuid;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN affected_staff_uuid := NEW.id;
  ELSIF TG_TABLE_NAME = 'roles' THEN affected_role_uuid := NEW.id;
  ELSE affected_staff_uuid := NEW.user_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id
    WHERE (affected_staff_uuid IS NULL OR ur.user_id=affected_staff_uuid) AND (affected_role_uuid IS NULL OR ur.role_id=affected_role_uuid)
      AND (u.organization_id IS DISTINCT FROM r.organization_id)
  ) THEN RAISE EXCEPTION 'Staff and role must belong to the same organization' USING ERRCODE='23514'; END IF;
  IF affected_staff_uuid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.id=affected_staff_uuid AND s.organization_id IS DISTINCT FROM u.organization_id)
    OR EXISTS (SELECT 1 FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE u.id=affected_staff_uuid AND t.organization_id IS DISTINCT FROM u.organization_id)
  ) THEN RAISE EXCEPTION 'Staff credentials must belong to the same organization' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_role_scope AFTER INSERT OR UPDATE ON user_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_user_scope AFTER UPDATE OF organization_id ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_role_move_scope AFTER UPDATE OF organization_id ON roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_session_scope AFTER INSERT OR UPDATE OF user_id,organization_id ON sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_reset_scope AFTER INSERT OR UPDATE OF user_id,organization_id ON password_reset_tokens DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();

--> statement-breakpoint
CREATE FUNCTION register_account_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_owner text; previous_kind text; target_kind text;
BEGIN
 target_kind:=CASE WHEN TG_TABLE_NAME='users' THEN 'staff' ELSE 'owner' END;
 IF EXISTS(SELECT 1 FROM actors WHERE id=NEW.id AND kind<>target_kind) THEN
  RAISE EXCEPTION 'Actor identity collision' USING ERRCODE='23514';
 END IF;
 IF target_kind='owner' THEN
  previous_owner:=current_setting('app.owner_id',true);previous_kind:=current_setting('app.actor_type',true);
  PERFORM set_config('app.owner_id',NEW.id::text,true);PERFORM set_config('app.actor_type','owner',true);
  INSERT INTO actors(id,kind,owner_id) VALUES(NEW.id,'owner',NEW.id);
  PERFORM set_config('app.owner_id',coalesce(previous_owner,''),true);PERFORM set_config('app.actor_type',coalesce(previous_kind,''),true);
 ELSE
  INSERT INTO actors(id,kind,staff_id) VALUES(NEW.id,'staff',NEW.id);
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER register_owner_actor AFTER INSERT ON platform_users FOR EACH ROW EXECUTE FUNCTION register_account_actor();
--> statement-breakpoint
CREATE TRIGGER register_staff_actor AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION register_account_actor();
--> statement-breakpoint
CREATE FUNCTION enforce_actor_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE column_name text; target_id uuid; valid boolean; target_kind text;
BEGIN
 FOREACH column_name IN ARRAY TG_ARGV LOOP
  target_id:=(to_jsonb(NEW)->>column_name)::uuid;
  IF target_id IS NULL THEN CONTINUE; END IF;
  SELECT a.kind, ((a.kind='owner' AND a.owner_id=o.owner_id) OR (a.kind='staff' AND u.organization_id=o.id))
    INTO target_kind,valid FROM actors a CROSS JOIN organizations o LEFT JOIN users u ON u.id=a.staff_id WHERE a.id=target_id AND o.id=NEW.organization_id;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Actor must belong to the organization' USING ERRCODE='23503'; END IF;
  IF TG_TABLE_NAME='audit_events' AND column_name='actor_id' THEN NEW.actor_kind:=CASE WHEN target_kind='owner' THEN 'owner' ELSE 'user' END; END IF;
 END LOOP;
 RETURN NEW;
END $$;

--> statement-breakpoint
CREATE FUNCTION provision_organization_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_scope text;
BEGIN
  previous_scope := current_setting('app.organization_id',true);
  PERFORM set_config('app.organization_id',NEW.id::text,true);
  INSERT INTO owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at) VALUES(NEW.owner_id,'trial',NEW.created_at,NEW.created_at+interval '7 days') ON CONFLICT DO NOTHING;

INSERT INTO roles (key, name, description, is_system) VALUES ('admin', 'Administrator', 'Full organization administration', true) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin' AND r.organization_id = nullif(current_setting('app.organization_id',true),'')::uuid ON CONFLICT DO NOTHING;

INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO notification_rules (event_key, enabled, offset_days, repeat_every_days, sender_name, sender_email, locale, subject_template, body_template, body_format, english_subject_template, english_body_template) VALUES
  ('delivery_prepared', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Bon de livraison {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Bonjour {{clientName}},</p><p>Votre bon de livraison {{documentNumber}}, prévu le {{deliveryDate}}, est disponible en pièce jointe.</p><p>Merci pour votre confiance.<br>L’équipe BaMoYa Finance</p></div>', 'html', 'BaMoYa Finance — Delivery note {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Your delivery note {{documentNumber}}, scheduled for {{deliveryDate}}, is attached.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>'),
  ('estimate_expiry_reminder', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Validité du devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">BaMoYa</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">Finance</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">SUIVI DE DEVIS</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Faisons le point sur votre devis</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous revenons vers vous au sujet de notre proposition. Sa date de validité est rappelée ci-dessous pour vous aider à organiser votre commande.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant de la proposition</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Devis</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Valable jusqu’au</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{validUntil}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Si vous souhaitez donner suite au devis, contactez-nous. Si sa date de validité est dépassée, nous pourrons vérifier les conditions et préparer une nouvelle proposition.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Nous serons ravis de vous accompagner dans la suite de votre projet.</p>
    <p style="margin:0;font-weight:700">L’équipe BaMoYa Finance</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">BaMoYa Finance · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'BaMoYa Finance — Estimate expiry {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Estimate {{documentNumber}} is valid until {{validUntil}}. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>'),
  ('estimate_sent', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">BaMoYa</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">Finance</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">VOTRE PROJET</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Votre devis est prêt</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous avons le plaisir de vous transmettre notre proposition. Prenez le temps de consulter le détail des produits et des tarifs.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant du devis</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Référence</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’émission</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{issueDate}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Valable jusqu’au</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{validUntil}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Ce devis est une proposition commerciale, et non une facture. Contactez-nous pour confirmer votre accord ou demander un ajustement.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Nous restons à votre disposition pour vous accompagner dans votre commande.</p>
    <p style="margin:0;font-weight:700">L’équipe BaMoYa Finance</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">BaMoYa Finance · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'BaMoYa Finance — Estimate {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Your estimate {{documentNumber}} is available. Total: {{total}} {{currency}}. Valid until {{validUntil}}.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>'),
  ('invoice_due_reminder', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Échéance de la facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">BaMoYa</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">Finance</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">SUIVI DE FACTURE</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Un point sur votre règlement</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous vous adressons ce rappel concernant le solde de votre facture. Vous trouverez son échéance et le montant restant ci-dessous.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Solde restant à régler</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{outstanding}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Facture</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’échéance</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{dueDate}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Si votre règlement vient d’être effectué, contactez-nous afin que nous puissions vérifier sa prise en compte.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">En cas de question sur votre échéance ou votre règlement, votre interlocuteur habituel reste à votre écoute.</p>
    <p style="margin:0;font-weight:700">L’équipe BaMoYa Finance</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">BaMoYa Finance · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'BaMoYa Finance — Invoice reminder {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Invoice {{documentNumber}} is due on {{dueDate}}. Outstanding: {{outstanding}} {{currency}}.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>'),
  ('invoice_sent', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">BaMoYa</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">Finance</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">FACTURATION</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Votre facture est disponible</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Merci pour votre confiance. Vous trouverez ci-dessous le récapitulatif de votre facture.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant de la facture</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Référence</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’émission</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{issueDate}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Le document joint reprend le détail des produits et les conditions de règlement.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Pour toute question concernant cette facture, contactez votre interlocuteur habituel.</p>
    <p style="margin:0;font-weight:700">L’équipe BaMoYa Finance</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">BaMoYa Finance · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'BaMoYa Finance — Invoice {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Your invoice {{documentNumber}} is available. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>'),
  ('payment_received', false, 0, NULL, 'BaMoYa Finance', 'notifications@example.invalid', 'company', 'BaMoYa Finance — Paiement {{paymentNumber}} reçu', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">BaMoYa</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">Finance</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">CONFIRMATION DE PAIEMENT</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Merci pour votre règlement</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous vous confirmons la réception du règlement suivant, enregistré sur votre facture.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant reçu</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{amount}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Paiement</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{paymentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Facture concernée</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Cette confirmation concerne uniquement le montant indiqué. Elle ne signifie pas nécessairement que la facture est intégralement réglée.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Merci pour votre confiance et pour votre collaboration.</p>
    <p style="margin:0;font-weight:700">L’équipe BaMoYa Finance</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">BaMoYa Finance · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'BaMoYa Finance — Payment {{paymentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">BaMoYa Finance</h2><p>Hello {{clientName}},</p><p>Your payment {{paymentNumber}} of {{amount}} {{currency}} has been recorded for invoice {{documentNumber}}.</p><p>Thank you for your trust.<br>The BaMoYa Finance team</p></div>')
ON CONFLICT DO NOTHING;

  PERFORM set_config('app.organization_id',coalesce(previous_scope,''),true);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organization_defaults_after_create AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION provision_organization_defaults();

--> statement-breakpoint
CREATE FUNCTION reject_platform_admin_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Platform administration audit is append-only' USING ERRCODE='42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER platform_admin_audit_append_only BEFORE UPDATE OR DELETE ON platform_admin_audit FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_change();
--> statement-breakpoint
CREATE TRIGGER platform_admin_audit_no_truncate BEFORE TRUNCATE ON platform_admin_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_platform_admin_audit_change();
--> statement-breakpoint
-- Coverage, plan and billing configuration change only through the administrator context.
-- The table owner (migrations, operator tooling) is exempt; the runtime role is not.
CREATE FUNCTION require_platform_admin_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('app.actor_type',true) IS DISTINCT FROM 'platform_admin'
   AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  IF TG_TABLE_NAME='owner_subscriptions' THEN
   -- Owners may only toggle cancellation; coverage and plan follow confirmed payments.
   IF to_jsonb(NEW)-'cancel_at_period_end' IS NOT DISTINCT FROM to_jsonb(OLD)-'cancel_at_period_end' THEN
    RETURN NEW;
   END IF;
  END IF;
  RAISE EXCEPTION 'Platform administrator context required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_subscriptions_admin_coverage BEFORE UPDATE ON owner_subscriptions FOR EACH ROW EXECUTE FUNCTION require_platform_admin_change();
--> statement-breakpoint
CREATE TRIGGER billing_settings_admin_only BEFORE UPDATE ON billing_settings FOR EACH ROW EXECUTE FUNCTION require_platform_admin_change();

--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "document_artifacts" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('assigned_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "product_categories" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "product_variants" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "products" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "clients" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "delivery_note_lines" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "delivery_notes" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "estimate_lines" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "estimates" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "invoice_lines" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "background_jobs" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('initiated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "media_assets" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('uploaded_by');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "client_notification_preferences" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "notification_dispatches" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "notification_rules" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "outbound_messages" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "payments" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "report_runs" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "report_schedule_recipients" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('user_id','created_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "report_schedules" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "bank_accounts" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "company_settings" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
--> statement-breakpoint
CREATE TRIGGER actor_scope_guard BEFORE INSERT OR UPDATE ON "document_templates" FOR EACH ROW EXECUTE FUNCTION enforce_actor_organization('created_by_actor_id','updated_by_actor_id');
