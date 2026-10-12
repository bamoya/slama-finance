CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
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
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(24) DEFAULT 'full' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_purpose_check" CHECK ("sessions"."purpose" IN ('full', 'password_change'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" varchar(12) DEFAULT 'fr' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Africa/Casablanca' NOT NULL,
	"theme" varchar(12) DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	CONSTRAINT "document_artifacts_type" CHECK ("document_artifacts"."document_type" in ('invoice', 'estimate', 'delivery_note', 'report_run', 'payment_receipt')),
	CONSTRAINT "document_artifacts_version" CHECK ("document_artifacts"."source_version" > 0),
	CONSTRAINT "document_artifacts_format" CHECK ("document_artifacts"."format" in ('pdf', 'csv', 'xlsx') and ("document_artifacts"."format" <> 'xlsx' or "document_artifacts"."document_type" = 'report_run')),
	CONSTRAINT "document_artifacts_size" CHECK ("document_artifacts"."byte_size" > 0 and "document_artifacts"."byte_size" <= 8388608),
	CONSTRAINT "document_artifacts_hash" CHECK ("document_artifacts"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "category_name_nonblank" CHECK (length(trim("product_categories"."name")) > 0),
	CONSTRAINT "category_version_positive" CHECK ("product_categories"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"weight_g" integer NOT NULL,
	"price_per_item" numeric(18, 2) NOT NULL,
	"cost_per_item" numeric(18, 2),
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "variant_weight_positive" CHECK ("product_variants"."weight_g" > 0),
	CONSTRAINT "variant_price_nonnegative" CHECK ("product_variants"."price_per_item" >= 0),
	CONSTRAINT "variant_cost_nonnegative" CHECK ("product_variants"."cost_per_item" is null or "product_variants"."cost_per_item" >= 0),
	CONSTRAINT "variant_version_positive" CHECK ("product_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "product_name_nonblank" CHECK (length(trim("products"."name")) > 0),
	CONSTRAINT "product_reference_nonblank" CHECK (length(trim("products"."reference")) > 0),
	CONSTRAINT "product_vat_range" CHECK ("products"."suggested_vat_rate" is null or ("products"."suggested_vat_rate" >= 0 and "products"."suggested_vat_rate" <= 100)),
	CONSTRAINT "product_version_positive" CHECK ("products"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
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
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"postal_code" text,
	"country_code" text DEFAULT 'MA' NOT NULL,
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "client_type_valid" CHECK ("clients"."type" in ('individual', 'company')),
	CONSTRAINT "client_identity_valid" CHECK ((
    ("clients"."type" = 'individual' and "clients"."first_name" is not null and "clients"."last_name" is not null
      and length(trim("clients"."first_name")) > 0 and length(trim("clients"."last_name")) > 0
      and "clients"."legal_name" is null and "clients"."trade_name" is null and "clients"."contact_name" is null
      and "clients"."ice" is null and "clients"."tax_identifier" is null and "clients"."registration_number" is null
      and "clients"."registration_city" is null and "clients"."professional_tax_number" is null)
    or ("clients"."type" = 'company' and "clients"."legal_name" is not null and length(trim("clients"."legal_name")) > 0 and "clients"."first_name" is null and "clients"."last_name" is null)
  )),
	CONSTRAINT "client_rc_pair" CHECK (("clients"."registration_number" is null) = ("clients"."registration_city" is null)),
	CONSTRAINT "client_billing_address" CHECK (length(trim("clients"."address_line1")) > 0 and length(trim("clients"."city")) > 0 and "clients"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "client_delivery_address" CHECK ((
    ("clients"."delivery_address_line1" is null and "clients"."delivery_address_line2" is null and "clients"."delivery_city" is null
      and "clients"."delivery_postal_code" is null and "clients"."delivery_country_code" is null)
    or ("clients"."delivery_address_line1" is not null and length(trim("clients"."delivery_address_line1")) > 0
      and "clients"."delivery_city" is not null and length(trim("clients"."delivery_city")) > 0
      and "clients"."delivery_country_code" is not null and "clients"."delivery_country_code" ~ '^[A-Z]{2}$')
  )),
	CONSTRAINT "client_locale_valid" CHECK ("clients"."locale" in ('fr-MA', 'en-GB')),
	CONSTRAINT "client_version_positive" CHECK ("clients"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_invoice_allocations" (
	"invoice_line_id" uuid NOT NULL,
	"delivery_note_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "delivery_invoice_allocations_invoice_line_id_delivery_note_line_id_pk" PRIMARY KEY("invoice_line_id","delivery_note_line_id"),
	CONSTRAINT "delivery_invoice_allocations_quantity" CHECK ("delivery_invoice_allocations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_note_lines" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "delivery_note_lines_position" CHECK ("delivery_note_lines"."position" >= 0),
	CONSTRAINT "delivery_note_lines_quantity" CHECK ("delivery_note_lines"."quantity" > 0),
	CONSTRAINT "delivery_note_lines_name" CHECK (length(trim("delivery_note_lines"."product_name")) > 0),
	CONSTRAINT "delivery_note_lines_weight" CHECK ("delivery_note_lines"."package_weight_g" is null or "delivery_note_lines"."package_weight_g" > 0),
	CONSTRAINT "delivery_note_lines_variant_pair" CHECK ("delivery_note_lines"."product_variant_id" is null or "delivery_note_lines"."product_id" is not null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"client_id" uuid NOT NULL,
	"invoice_id" uuid,
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "delivery_notes_number_unique" UNIQUE("number"),
	CONSTRAINT "delivery_notes_status" CHECK ("delivery_notes"."status" in ('draft','delivered','cancelled')),
	CONSTRAINT "delivery_notes_versions" CHECK ("delivery_notes"."version" > 0 and "delivery_notes"."content_version" > 0),
	CONSTRAINT "delivery_notes_locale_override" CHECK ("delivery_notes"."locale_override" is null or "delivery_notes"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "delivery_notes_address" CHECK (length(trim("delivery_notes"."delivery_address")) > 0),
	CONSTRAINT "delivery_notes_prepared_data" CHECK (("delivery_notes"."status" = 'draft' and "delivery_notes"."number" is null) or ("delivery_notes"."status" <> 'draft' and "delivery_notes"."number" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_lines" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
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
CREATE TABLE IF NOT EXISTS "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision_of_id" uuid,
	"client_id" uuid NOT NULL,
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "estimates_number_unique" UNIQUE("number"),
	CONSTRAINT "estimates_revision_not_self" CHECK ("estimates"."revision_of_id" is null or "estimates"."revision_of_id" <> "estimates"."id"),
	CONSTRAINT "estimates_status" CHECK ("estimates"."status" in ('draft','issued','sent','accepted','rejected','expired','cancelled','superseded')),
	CONSTRAINT "estimates_currency" CHECK ("estimates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "estimates_locale" CHECK ("estimates"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "estimates_locale_override" CHECK ("estimates"."locale_override" is null or "estimates"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "estimates_versions" CHECK ("estimates"."version" > 0 and "estimates"."content_version" > 0),
	CONSTRAINT "estimates_totals" CHECK ("estimates"."subtotal" >= 0 and "estimates"."tax_total" >= 0 and "estimates"."total" = "estimates"."subtotal" + "estimates"."tax_total"),
	CONSTRAINT "estimates_issued_data" CHECK (("estimates"."status" = 'draft' and "estimates"."number" is null and "estimates"."issued_at" is null) or ("estimates"."status" <> 'draft' and "estimates"."number" is not null and "estimates"."issued_at" is not null and "estimates"."valid_until" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_lines" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
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
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_id" uuid NOT NULL,
	"template_id" uuid,
	"source_estimate_id" uuid,
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_conversion_operation_id_unique" UNIQUE("conversion_operation_id"),
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" in ('draft','issued','sent','cancelled')),
	CONSTRAINT "invoices_currency" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_locale" CHECK ("invoices"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "invoices_locale_override" CHECK ("invoices"."locale_override" is null or "invoices"."locale_override" in ('fr-MA','en-GB')),
	CONSTRAINT "invoices_versions" CHECK ("invoices"."version" > 0 and "invoices"."content_version" > 0),
	CONSTRAINT "invoices_totals" CHECK ("invoices"."subtotal" >= 0 and "invoices"."tax_total" >= 0 and "invoices"."total" = "invoices"."subtotal" + "invoices"."tax_total"),
	CONSTRAINT "invoices_issued_data" CHECK (("invoices"."status" = 'draft' and "invoices"."number" is null and "invoices"."issued_at" is null) or ("invoices"."status" <> 'draft' and "invoices"."number" is not null and "invoices"."issued_at" is not null and "invoices"."due_date" is not null)),
	CONSTRAINT "invoices_conversion_pair" CHECK (("invoices"."conversion_operation_id" is null) = ("invoices"."conversion_request" is null) and ("invoices"."source_estimate_id" is null or "invoices"."conversion_operation_id" is not null))
);
--> statement-breakpoint
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
	CONSTRAINT "background_jobs_type" CHECK ("background_jobs"."job_type" in ('prepare_pdf','prepare_notification')),
	CONSTRAINT "background_jobs_status" CHECK ("background_jobs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "background_jobs_attempts" CHECK ("background_jobs"."attempts" >= 0 and "background_jobs"."max_attempts" > 0 and "background_jobs"."attempts" <= "background_jobs"."max_attempts"),
	CONSTRAINT "background_jobs_payload_version" CHECK ("background_jobs"."payload_version" > 0)
);
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
CREATE TABLE IF NOT EXISTS "client_notification_preferences" (
	"client_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "client_notification_preferences_client_id_rule_id_pk" PRIMARY KEY("client_id","rule_id"),
	CONSTRAINT "client_notification_preferences_version" CHECK ("client_notification_preferences"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"logical_occurrence_key" text NOT NULL,
	"message_id" uuid NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "notification_dispatches_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "notification_dispatches_source" CHECK ("notification_dispatches"."source_type" in ('invoice','estimate','payment','delivery_note','report_run')),
	CONSTRAINT "notification_dispatches_event" CHECK ("notification_dispatches"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder','report_available'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_rules" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "notification_rules_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "notification_rules_event" CHECK ("notification_rules"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder')),
	CONSTRAINT "notification_rules_timing" CHECK ("notification_rules"."offset_days" between -365 and 365 and ("notification_rules"."repeat_every_days" is null or "notification_rules"."repeat_every_days" between 1 and 365) and ("notification_rules"."event_key" in ('invoice_due_reminder','estimate_expiry_reminder') or ("notification_rules"."offset_days" = 0 and "notification_rules"."repeat_every_days" is null))),
	CONSTRAINT "notification_rules_version" CHECK ("notification_rules"."version" > 0),
	CONSTRAINT "notification_rules_body_format" CHECK ("notification_rules"."body_format" in ('text','html')),
	CONSTRAINT "notification_rules_locale" CHECK ("notification_rules"."locale" in ('company','fr-MA','en-GB'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbound_message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_message_attachments_size" CHECK ("outbound_message_attachments"."byte_size" > 0 and "outbound_message_attachments"."byte_size" <= 8388608),
	CONSTRAINT "outbound_message_attachments_position" CHECK ("outbound_message_attachments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbound_messages" (
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
	"created_by_user_id" uuid,
	CONSTRAINT "outbound_messages_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "outbound_messages_status" CHECK ("outbound_messages"."status" in ('queued','sending','sent','failed','cancelled')),
	CONSTRAINT "outbound_messages_attempts" CHECK ("outbound_messages"."attempts" >= 0 and "outbound_messages"."max_attempts" > 0 and "outbound_messages"."attempts" <= "outbound_messages"."max_attempts"),
	CONSTRAINT "outbound_messages_lease" CHECK (("outbound_messages"."status" = 'sending') = ("outbound_messages"."lease_token" is not null and "outbound_messages"."locked_until" is not null)),
	CONSTRAINT "outbound_messages_completion" CHECK (("outbound_messages"."status" = 'sent') = ("outbound_messages"."sent_at" is not null and "outbound_messages"."provider_message_id" is not null)),
	CONSTRAINT "outbound_messages_hash" CHECK ("outbound_messages"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
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
	"reference" text,
	"cheque_bank" text,
	"cheque_number" text,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "payments_number_unique" UNIQUE("number"),
	CONSTRAINT "payments_operation_id_unique" UNIQUE("operation_id"),
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
CREATE TABLE IF NOT EXISTS "report_runs" (
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
	"created_by_user_id" uuid,
	CONSTRAINT "report_runs_trigger" CHECK ("report_runs"."trigger" in ('scheduled', 'test') and ("report_runs"."trigger" <> 'test' or "report_runs"."created_by_user_id" is not null)),
	CONSTRAINT "report_runs_status" CHECK ("report_runs"."status" in ('queued','running','succeeded','failed','cancelled')),
	CONSTRAINT "report_runs_attempts" CHECK ("report_runs"."attempts" >= 0 and "report_runs"."max_attempts" > 0 and "report_runs"."attempts" <= "report_runs"."max_attempts"),
	CONSTRAINT "report_runs_period" CHECK ("report_runs"."period_start" <= "report_runs"."period_end"),
	CONSTRAINT "report_runs_capture_pair" CHECK (("report_runs"."data_snapshot" is null) = ("report_runs"."data_captured_at" is null)),
	CONSTRAINT "report_runs_lease" CHECK (("report_runs"."status"='running' and "report_runs"."lease_token" is not null and "report_runs"."locked_until" is not null) or ("report_runs"."status"<>'running' and "report_runs"."lease_token" is null and "report_runs"."locked_until" is null)),
	CONSTRAINT "report_runs_complete" CHECK ("report_runs"."status" not in ('succeeded','failed','cancelled') or "report_runs"."finished_at" is not null),
	CONSTRAINT "report_runs_succeeded_capture" CHECK ("report_runs"."status"<>'succeeded' or "report_runs"."data_snapshot" is not null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_schedule_recipients" (
	"schedule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "report_schedule_recipients_schedule_id_user_id_pk" PRIMARY KEY("schedule_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_schedules" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
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
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
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
CREATE TABLE IF NOT EXISTS "bank_accounts" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "bank_rib" CHECK ("bank_accounts"."rib" is null or "bank_accounts"."rib" ~ '^[0-9]{24}$'),
	CONSTRAINT "bank_identifier" CHECK ("bank_accounts"."rib" is not null or "bank_accounts"."iban" is not null),
	CONSTRAINT "bank_version" CHECK ("bank_accounts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
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
	"default_template_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "company_singleton" CHECK ("company_settings"."id" = 1),
	CONSTRAINT "company_locale" CHECK ("company_settings"."locale" in ('fr-MA','en-GB')),
	CONSTRAINT "company_capital" CHECK ("company_settings"."share_capital" is null or "company_settings"."share_capital" >= 0),
	CONSTRAINT "company_rc_pair" CHECK (("company_settings"."registration_number" is null) = ("company_settings"."registration_city" is null)),
	CONSTRAINT "company_ice" CHECK ("company_settings"."ice" is null or "company_settings"."ice" ~ '^[0-9]{15}$'),
	CONSTRAINT "company_days" CHECK ("company_settings"."payment_due_days" between 0 and 3650 and "company_settings"."estimate_valid_days" between 0 and 3650),
	CONSTRAINT "company_version" CHECK ("company_settings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_templates" (
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
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "template_layout" CHECK ("document_templates"."layout" in ('classic','modern','minimal','signature','atelier','ledger','essential')),
	CONSTRAINT "template_density" CHECK ("document_templates"."density" in ('standard','compact')),
	CONSTRAINT "template_color" CHECK ("document_templates"."accent_color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "template_version" CHECK ("document_templates"."version" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "document_artifacts" ADD CONSTRAINT "document_artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_notification_preferences" ADD CONSTRAINT "client_notification_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
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
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedule_recipients" ADD CONSTRAINT "report_schedule_recipients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_default_template_id_document_templates_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_key_unique" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_artifacts_owner_version_format_uq" ON "document_artifacts" USING btree ("document_type","document_id","source_version","format");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_artifacts_owner_idx" ON "document_artifacts" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_normalized_name_unique" ON "product_categories" USING btree (lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_weight_unique" ON "product_variants" USING btree ("product_id","weight_g");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_reference_unique" ON "products" USING btree (lower(trim("reference")));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_type_status_idx" ON "clients" USING btree ("type","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_email_idx" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_invoice_allocations_delivery_idx" ON "delivery_invoice_allocations" USING btree ("delivery_note_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_note_lines_position_uq" ON "delivery_note_lines" USING btree ("delivery_note_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_note_lines_source_invoice_idx" ON "delivery_note_lines" USING btree ("source_invoice_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_client_status_idx" ON "delivery_notes" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estimate_lines_position_uq" ON "estimate_lines" USING btree ("estimate_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_lines_product_idx" ON "estimate_lines" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estimates_revision_of_uq" ON "estimates" USING btree ("revision_of_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_client_status_idx" ON "estimates" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_issue_date_idx" ON "estimates" USING btree ("issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_lines_position_uq" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_lines_product_idx" ON "invoice_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_client_status_idx" ON "invoices" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_source_estimate_idx" ON "invoices" USING btree ("source_estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "background_jobs_claim_idx" ON "background_jobs" USING btree ("status","available_at","locked_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_cleanup_idx" ON "media_assets" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_occurrence_uq" ON "notification_dispatches" USING btree ("source_type","source_id","event_key","occurrence_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_logical_uq" ON "notification_dispatches" USING btree ("source_type","source_id","event_key","logical_occurrence_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_dispatches_source_idx" ON "notification_dispatches" USING btree ("source_type","source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_message_attachments_position_uq" ON "outbound_message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_message_attachments_key_idx" ON "outbound_message_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_claim_idx" ON "outbound_messages" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_lease_idx" ON "outbound_messages" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_provider_idx" ON "outbound_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_invoice_status_idx" ON "payments" USING btree ("invoice_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_collection_idx" ON "payments" USING btree ("collected_on","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_cheque_identity_idx" ON "payments" USING btree ("cheque_bank","cheque_number") WHERE "payments"."status" <> 'cancelled' and "payments"."method" = 'cheque';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_runs_occurrence_uq" ON "report_runs" USING btree ("schedule_id","scheduled_for") WHERE "report_runs"."trigger" = 'scheduled';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_retry_idx" ON "report_runs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_lease_idx" ON "report_runs" USING btree ("locked_until") WHERE "report_runs"."status"='running';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedule_recipients_user_idx" ON "report_schedule_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedules_due_idx" ON "report_schedules" USING btree ("next_run_at") WHERE "report_schedules"."enabled" and "report_schedules"."archived_at" is null;
--> statement-breakpoint
-- Serialize direct variant writes on their parent, including writes outside the API.
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
-- Evaluated at commit so product and initial variants can be inserted together.
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
