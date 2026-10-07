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
	CONSTRAINT "delivery_notes_status" CHECK ("delivery_notes"."status" in ('draft','prepared','delivered','acknowledged','cancelled')),
	CONSTRAINT "delivery_notes_versions" CHECK ("delivery_notes"."version" > 0 and "delivery_notes"."content_version" > 0),
	CONSTRAINT "delivery_notes_address" CHECK (length(trim("delivery_notes"."delivery_address")) > 0),
	CONSTRAINT "delivery_notes_prepared_data" CHECK (("delivery_notes"."status" = 'draft' and "delivery_notes"."number" is null) or ("delivery_notes"."status" <> 'draft' and "delivery_notes"."number" is not null))
);
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
CREATE INDEX IF NOT EXISTS "delivery_invoice_allocations_delivery_idx" ON "delivery_invoice_allocations" USING btree ("delivery_note_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_note_lines_position_uq" ON "delivery_note_lines" USING btree ("delivery_note_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_note_lines_source_invoice_idx" ON "delivery_note_lines" USING btree ("source_invoice_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_client_status_idx" ON "delivery_notes" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_invoice_idx" ON "delivery_notes" USING btree ("invoice_id");
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('delivery_notes.read', 'View delivery notes'),
('delivery_notes.create', 'Create delivery notes'),
('delivery_notes.update', 'Edit draft delivery notes'),
('delivery_notes.delete', 'Delete draft delivery notes'),
('delivery_notes.prepare', 'Prepare delivery notes'),
('delivery_notes.deliver', 'Mark delivery notes delivered'),
('delivery_notes.acknowledge', 'Acknowledge delivery notes'),
('delivery_notes.cancel', 'Cancel delivery notes')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key LIKE 'delivery_notes.%'
ON CONFLICT DO NOTHING;
