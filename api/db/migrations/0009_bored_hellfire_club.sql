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
	CONSTRAINT "invoices_locale" CHECK ("invoices"."locale" in ('fr-MA','ar-MA')),
	CONSTRAINT "invoices_versions" CHECK ("invoices"."version" > 0 and "invoices"."content_version" > 0),
	CONSTRAINT "invoices_totals" CHECK ("invoices"."subtotal" >= 0 and "invoices"."tax_total" >= 0 and "invoices"."total" = "invoices"."subtotal" + "invoices"."tax_total"),
	CONSTRAINT "invoices_issued_data" CHECK (("invoices"."status" = 'draft' and "invoices"."number" is null and "invoices"."issued_at" is null) or ("invoices"."status" <> 'draft' and "invoices"."number" is not null and "invoices"."issued_at" is not null and "invoices"."due_date" is not null)),
	CONSTRAINT "invoices_conversion_pair" CHECK (("invoices"."conversion_operation_id" is null) = ("invoices"."conversion_request" is null) and ("invoices"."source_estimate_id" is null or "invoices"."conversion_operation_id" is not null))
);
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
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_lines_position_uq" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_lines_product_idx" ON "invoice_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_client_status_idx" ON "invoices" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_source_estimate_idx" ON "invoices" USING btree ("source_estimate_id");
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('invoices.read', 'View invoices'),
('invoices.create', 'Create invoices'),
('invoices.update', 'Edit draft invoices'),
('invoices.delete', 'Delete draft invoices'),
('invoices.issue', 'Issue invoices'),
('invoices.cancel', 'Cancel issued invoices')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key LIKE 'invoices.%'
ON CONFLICT DO NOTHING;
