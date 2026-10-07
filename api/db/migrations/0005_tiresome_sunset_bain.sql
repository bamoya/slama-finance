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
	CONSTRAINT "client_locale_valid" CHECK ("clients"."locale" in ('fr-MA', 'ar-MA')),
	CONSTRAINT "client_version_positive" CHECK ("clients"."version" > 0)
);
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
CREATE INDEX IF NOT EXISTS "clients_type_status_idx" ON "clients" USING btree ("type","archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_email_idx" ON "clients" USING btree ("email");
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('clients.read', 'View clients'), ('clients.create', 'Create clients'),
('clients.update', 'Edit clients'), ('clients.archive', 'Archive clients'),
('clients.restore', 'Restore clients'), ('clients.delete', 'Delete unused clients')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key LIKE 'clients.%'
ON CONFLICT DO NOTHING;
