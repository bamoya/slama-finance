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
	CONSTRAINT "notification_dispatches_source" CHECK ("notification_dispatches"."source_type" in ('invoice','estimate','payment','report_run')),
	CONSTRAINT "notification_dispatches_event" CHECK ("notification_dispatches"."event_key" in ('invoice_sent','estimate_sent','payment_received','invoice_due_reminder','estimate_expiry_reminder','report_available'))
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
	"locale" text DEFAULT 'fr-MA' NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "notification_rules_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "notification_rules_event" CHECK ("notification_rules"."event_key" in ('invoice_sent','estimate_sent','payment_received','invoice_due_reminder','estimate_expiry_reminder')),
	CONSTRAINT "notification_rules_timing" CHECK ("notification_rules"."offset_days" between -365 and 365 and ("notification_rules"."repeat_every_days" is null or "notification_rules"."repeat_every_days" between 1 and 365) and ("notification_rules"."event_key" in ('invoice_due_reminder','estimate_expiry_reminder') or ("notification_rules"."offset_days" = 0 and "notification_rules"."repeat_every_days" is null))),
	CONSTRAINT "notification_rules_version" CHECK ("notification_rules"."version" > 0),
	CONSTRAINT "notification_rules_locale" CHECK ("notification_rules"."locale" in ('fr-MA','ar-MA'))
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
CREATE TABLE IF NOT EXISTS "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
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
	CONSTRAINT "report_schedules_cadence" CHECK (("report_schedules"."frequency"='daily' and "report_schedules"."weekday" is null and "report_schedules"."month_day" is null) or ("report_schedules"."frequency"='weekly' and "report_schedules"."weekday" between 1 and 7 and "report_schedules"."month_day" is null) or ("report_schedules"."frequency"='monthly' and "report_schedules"."weekday" is null and "report_schedules"."month_day" between 1 and 28)),
	CONSTRAINT "report_schedules_time" CHECK ("report_schedules"."local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "report_schedules_period" CHECK ("report_schedules"."period" in ('previous_day','previous_week','previous_month')),
	CONSTRAINT "report_schedules_sections" CHECK (cardinality("report_schedules"."included_sections") between 1 and 13 and "report_schedules"."included_sections" <@ array['summary','revenue','collections','outstanding','overdue','payment_methods','pending_cheques','vat','sales_by_client','sales_by_product','sales_by_category','estimates','deliveries']::text[]),
	CONSTRAINT "report_schedules_active" CHECK (("report_schedules"."enabled" and "report_schedules"."next_run_at" is not null and "report_schedules"."archived_at" is null) or (not "report_schedules"."enabled" and "report_schedules"."next_run_at" is null))
);
--> statement-breakpoint
ALTER TABLE "background_jobs" DROP CONSTRAINT "background_jobs_type";--> statement-breakpoint
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
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_occurrence_uq" ON "notification_dispatches" USING btree ("source_type","source_id","event_key","occurrence_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dispatches_logical_uq" ON "notification_dispatches" USING btree ("source_type","source_id","event_key","logical_occurrence_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_dispatches_source_idx" ON "notification_dispatches" USING btree ("source_type","source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_message_attachments_position_uq" ON "outbound_message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_message_attachments_key_idx" ON "outbound_message_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_claim_idx" ON "outbound_messages" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_lease_idx" ON "outbound_messages" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_messages_provider_idx" ON "outbound_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_runs_occurrence_uq" ON "report_runs" USING btree ("schedule_id","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_retry_idx" ON "report_runs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_runs_lease_idx" ON "report_runs" USING btree ("locked_until") WHERE "report_runs"."status"='running';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedule_recipients_user_idx" ON "report_schedule_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedules_due_idx" ON "report_schedules" USING btree ("next_run_at") WHERE "report_schedules"."enabled" and "report_schedules"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_type" CHECK ("background_jobs"."job_type" in ('prepare_pdf','prepare_notification'));
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('reports.read', 'reports / read'),
('reports.export', 'reports / export'),
('reports.sections.summary', 'reports / sections / summary'),
('reports.sections.revenue', 'reports / sections / revenue'),
('reports.sections.collections', 'reports / sections / collections'),
('reports.sections.outstanding', 'reports / sections / outstanding'),
('reports.sections.overdue', 'reports / sections / overdue'),
('reports.sections.payment_methods', 'reports / sections / payment methods'),
('reports.sections.pending_cheques', 'reports / sections / pending cheques'),
('reports.sections.vat', 'reports / sections / vat'),
('reports.sections.sales_by_client', 'reports / sections / sales by client'),
('reports.sections.sales_by_product', 'reports / sections / sales by product'),
('reports.sections.sales_by_category', 'reports / sections / sales by category'),
('reports.sections.estimates', 'reports / sections / estimates'),
('reports.sections.deliveries', 'reports / sections / deliveries'),
('report_schedules.read', 'report schedules / read'),
('report_schedules.create', 'report schedules / create'),
('report_schedules.update', 'report schedules / update'),
('report_schedules.enable', 'report schedules / enable'),
('report_schedules.disable', 'report schedules / disable'),
('report_schedules.archive', 'report schedules / archive'),
('report_schedules.restore', 'report schedules / restore'),
('report_schedules.delete', 'report schedules / delete'),
('report_runs.read', 'report runs / read'),
('report_runs.retry', 'report runs / retry'),
('notification_rules.read', 'notification rules / read'),
('notification_rules.update', 'notification rules / update'),
('notification_rules.test', 'notification rules / test'),
('client_notification_preferences.read', 'client notification preferences / read'),
('client_notification_preferences.update', 'client notification preferences / update'),
('client_notification_preferences.delete', 'client notification preferences / delete'),
('invoices.send', 'invoices / send'),
('estimates.send', 'estimates / send'),
('notification_dispatches.read', 'notification dispatches / read'),
('notification_dispatches.retry', 'notification dispatches / retry'),
('notification_dispatches.cancel', 'notification dispatches / cancel')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO notification_rules (event_key, subject_template, body_template) VALUES
('invoice_sent', '{{documentNumber}}', E'Bonjour {{clientName}},\nVotre document {{documentNumber}} est disponible.'),
('estimate_sent', '{{documentNumber}}', E'Bonjour {{clientName}},\nVotre document {{documentNumber}} est disponible.'),
('payment_received', '{{documentNumber}}', E'Bonjour {{clientName}},\nVotre document {{documentNumber}} est disponible.'),
('invoice_due_reminder', '{{documentNumber}}', E'Bonjour {{clientName}},\nVotre document {{documentNumber}} est disponible.'),
('estimate_expiry_reminder', '{{documentNumber}}', E'Bonjour {{clientName}},\nVotre document {{documentNumber}} est disponible.')
ON CONFLICT (event_key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('reports.read', 'reports.export', 'reports.sections.summary', 'reports.sections.revenue', 'reports.sections.collections', 'reports.sections.outstanding', 'reports.sections.overdue', 'reports.sections.payment_methods', 'reports.sections.pending_cheques', 'reports.sections.vat', 'reports.sections.sales_by_client', 'reports.sections.sales_by_product', 'reports.sections.sales_by_category', 'reports.sections.estimates', 'reports.sections.deliveries', 'report_schedules.read', 'report_schedules.create', 'report_schedules.update', 'report_schedules.enable', 'report_schedules.disable', 'report_schedules.archive', 'report_schedules.restore', 'report_schedules.delete', 'report_runs.read', 'report_runs.retry', 'notification_rules.read', 'notification_rules.update', 'notification_rules.test', 'client_notification_preferences.read', 'client_notification_preferences.update', 'client_notification_preferences.delete', 'invoices.send', 'estimates.send', 'notification_dispatches.read', 'notification_dispatches.retry', 'notification_dispatches.cancel')
ON CONFLICT DO NOTHING;
