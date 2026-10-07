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
	"logo_object_key" text,
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
	"accent_color" text DEFAULT '#ad7d1d' NOT NULL,
	"logo_object_key" text,
	"signature_object_key" text,
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
	CONSTRAINT "template_layout" CHECK ("document_templates"."layout" in ('classic','modern','minimal')),
	CONSTRAINT "template_color" CHECK ("document_templates"."accent_color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "template_version" CHECK ("document_templates"."version" > 0)
);
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
INSERT INTO company_settings (id) VALUES (1);
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES ('settings.view','View company settings and logos'),('settings.update','Update company settings and upload assets'),('bank_accounts.view','View bank accounts'),('bank_accounts.manage','Manage bank accounts'),('templates.view','View and preview document templates'),('templates.manage','Manage templates and private signatures') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin' ON CONFLICT DO NOTHING;
