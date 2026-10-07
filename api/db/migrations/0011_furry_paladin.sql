CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"creation_request" jsonb NOT NULL,
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
      or ("payments"."method" = 'bank_transfer' and "payments"."reference" is not null and length(trim("payments"."reference")) > 0 and "payments"."cheque_bank" is null and "payments"."cheque_number" is null)
      or ("payments"."method" = 'cheque' and "payments"."cheque_bank" is not null and length(trim("payments"."cheque_bank")) > 0 and "payments"."cheque_number" is not null and length(trim("payments"."cheque_number")) > 0 and "payments"."reference" is null)
    )),
	CONSTRAINT "payments_status_dates" CHECK ((
      ("payments"."status" = 'pending' and "payments"."collected_on" is null and "payments"."confirmed_at" is null and "payments"."cancelled_at" is null and "payments"."cancellation_reason" is null)
      or ("payments"."status" = 'confirmed' and "payments"."collected_on" is not null and "payments"."confirmed_at" is not null and "payments"."cancelled_at" is null and "payments"."cancellation_reason" is null)
      or ("payments"."status" = 'cancelled' and "payments"."cancelled_at" is not null and "payments"."cancellation_reason" is not null and length(trim("payments"."cancellation_reason")) > 0)
    ))
);
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
CREATE INDEX IF NOT EXISTS "payments_invoice_status_idx" ON "payments" USING btree ("invoice_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_collection_idx" ON "payments" USING btree ("collected_on","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_cheque_identity_idx" ON "payments" USING btree ("cheque_bank","cheque_number") WHERE "payments"."status" <> 'cancelled' and "payments"."method" = 'cheque';
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('payments.read', 'View payments'),
('payments.create', 'Record installment payments'),
('payments.confirm', 'Confirm pending payments'),
('payments.cancel', 'Cancel payments with a reason')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('payments.read', 'payments.create', 'payments.confirm', 'payments.cancel')
ON CONFLICT DO NOTHING;
