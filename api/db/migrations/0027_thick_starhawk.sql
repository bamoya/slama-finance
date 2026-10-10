ALTER TABLE "clients" DROP CONSTRAINT "client_locale_valid";--> statement-breakpoint
ALTER TABLE "estimates" DROP CONSTRAINT "estimates_locale";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_locale";--> statement-breakpoint
ALTER TABLE "notification_rules" DROP CONSTRAINT "notification_rules_locale";--> statement-breakpoint
ALTER TABLE "report_schedules" DROP CONSTRAINT "report_schedules_language";--> statement-breakpoint
ALTER TABLE "notification_rules" ALTER COLUMN "locale" SET DEFAULT 'company';--> statement-breakpoint
ALTER TABLE "report_schedules" ALTER COLUMN "language" SET DEFAULT 'company';--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "locale_override" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "locale_override" text;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "english_subject_template" text;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "english_body_template" text;--> statement-breakpoint
-- Normalize retired language settings. Existing stored PDFs and queued messages are untouched.
UPDATE company_settings SET locale = 'fr-MA' WHERE locale NOT IN ('fr-MA','en-GB');--> statement-breakpoint
UPDATE clients SET locale = 'fr-MA' WHERE locale NOT IN ('fr-MA','en-GB');--> statement-breakpoint
UPDATE estimates SET locale = 'fr-MA' WHERE locale NOT IN ('fr-MA','en-GB');--> statement-breakpoint
UPDATE invoices SET locale = 'fr-MA' WHERE locale NOT IN ('fr-MA','en-GB');--> statement-breakpoint
-- Preserve the language of pre-existing documents when they are revised or converted.
UPDATE estimates SET locale_override = locale WHERE status <> 'draft';--> statement-breakpoint
UPDATE invoices SET locale_override = locale WHERE status <> 'draft';--> statement-breakpoint
UPDATE notification_rules SET locale = 'company' WHERE locale IN ('fr-MA','ar-MA');--> statement-breakpoint
UPDATE report_schedules SET language = 'company' WHERE language = 'fr';--> statement-breakpoint
-- English defaults are independent of the customized French content. Never overwrite it.
UPDATE notification_rules SET
  english_subject_template = CASE event_key
    WHEN 'invoice_sent' THEN 'Slama Agricole — Invoice {{documentNumber}}'
    WHEN 'estimate_sent' THEN 'Slama Agricole — Estimate {{documentNumber}}'
    WHEN 'payment_received' THEN 'Slama Agricole — Payment {{paymentNumber}}'
    WHEN 'invoice_due_reminder' THEN 'Slama Agricole — Invoice reminder {{documentNumber}}'
    ELSE 'Slama Agricole — Estimate expiry {{documentNumber}}' END,
  english_body_template = '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>' || CASE event_key
    WHEN 'invoice_sent' THEN 'Your invoice {{documentNumber}} is available. Total: {{total}} {{currency}}.'
    WHEN 'estimate_sent' THEN 'Your estimate {{documentNumber}} is available. Total: {{total}} {{currency}}. Valid until {{validUntil}}.'
    WHEN 'payment_received' THEN 'Your payment {{paymentNumber}} of {{amount}} {{currency}} has been recorded for invoice {{documentNumber}}.'
    WHEN 'invoice_due_reminder' THEN 'Invoice {{documentNumber}} is due on {{dueDate}}. Outstanding: {{outstanding}} {{currency}}.'
    ELSE 'Estimate {{documentNumber}} is valid until {{validUntil}}. Total: {{total}} {{currency}}.' END || '</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'
WHERE english_subject_template IS NULL AND english_body_template IS NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "client_locale_valid" CHECK ("clients"."locale" in ('fr-MA', 'en-GB'));--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_locale_override" CHECK ("estimates"."locale_override" is null or "estimates"."locale_override" in ('fr-MA','en-GB'));--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_locale" CHECK ("estimates"."locale" in ('fr-MA','en-GB'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_locale_override" CHECK ("invoices"."locale_override" is null or "invoices"."locale_override" in ('fr-MA','en-GB'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_locale" CHECK ("invoices"."locale" in ('fr-MA','en-GB'));--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_locale" CHECK ("notification_rules"."locale" in ('company','fr-MA','en-GB'));--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_language" CHECK ("report_schedules"."language" in ('company', 'fr', 'en'));--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_locale" CHECK ("company_settings"."locale" in ('fr-MA','en-GB'));
