ALTER TABLE "clients" DROP CONSTRAINT "client_rc_pair";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "client_identity_valid";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "client_billing_address";--> statement-breakpoint
ALTER TABLE "clients" DROP CONSTRAINT "client_delivery_address";--> statement-breakpoint
ALTER TABLE "delivery_notes" DROP CONSTRAINT "delivery_notes_address";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "address_line1" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "country_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "country_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "client_identity_valid" CHECK ((
    ("clients"."type" = 'individual' and (length(trim(coalesce("clients"."first_name",''))) > 0 or length(trim(coalesce("clients"."last_name",''))) > 0)
      and "clients"."legal_name" is null and "clients"."trade_name" is null and "clients"."contact_name" is null
      and "clients"."ice" is null and "clients"."tax_identifier" is null and "clients"."registration_number" is null
      and "clients"."registration_city" is null and "clients"."professional_tax_number" is null)
    or ("clients"."type" = 'company' and "clients"."legal_name" is not null and length(trim("clients"."legal_name")) > 0 and "clients"."first_name" is null and "clients"."last_name" is null)
  ));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "client_billing_address" CHECK ("clients"."country_code" is null or "clients"."country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "client_delivery_address" CHECK ("clients"."delivery_country_code" is null or "clients"."delivery_country_code" ~ '^[A-Z]{2}$');