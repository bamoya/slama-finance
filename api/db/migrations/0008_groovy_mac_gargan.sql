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
	"client_id" uuid NOT NULL,
	"template_id" uuid,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"locale" text DEFAULT 'fr-MA' NOT NULL,
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
	CONSTRAINT "estimates_status" CHECK ("estimates"."status" in ('draft','issued','sent','accepted','rejected','expired','cancelled')),
	CONSTRAINT "estimates_currency" CHECK ("estimates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "estimates_locale" CHECK ("estimates"."locale" in ('fr-MA','ar-MA')),
	CONSTRAINT "estimates_versions" CHECK ("estimates"."version" > 0 and "estimates"."content_version" > 0),
	CONSTRAINT "estimates_totals" CHECK ("estimates"."subtotal" >= 0 and "estimates"."tax_total" >= 0 and "estimates"."total" = "estimates"."subtotal" + "estimates"."tax_total"),
	CONSTRAINT "estimates_issued_data" CHECK (("estimates"."status" = 'draft' and "estimates"."number" is null and "estimates"."issued_at" is null) or ("estimates"."status" <> 'draft' and "estimates"."number" is not null and "estimates"."issued_at" is not null and "estimates"."valid_until" is not null))
);
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
CREATE UNIQUE INDEX IF NOT EXISTS "estimate_lines_position_uq" ON "estimate_lines" USING btree ("estimate_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_lines_product_idx" ON "estimate_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_client_status_idx" ON "estimates" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimates_issue_date_idx" ON "estimates" USING btree ("issue_date");
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('estimates.read', 'View estimates'),
('estimates.create', 'Create estimates'),
('estimates.update', 'Edit estimates and record decisions'),
('estimates.delete', 'Delete draft estimates'),
('estimates.issue', 'Issue estimates'),
('estimates.cancel', 'Cancel issued estimates')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key LIKE 'estimates.%'
ON CONFLICT DO NOTHING;
