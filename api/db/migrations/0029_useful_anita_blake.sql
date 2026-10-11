ALTER TABLE "notification_dispatches" DROP CONSTRAINT "notification_dispatches_source";--> statement-breakpoint
ALTER TABLE "notification_dispatches" DROP CONSTRAINT "notification_dispatches_event";--> statement-breakpoint
ALTER TABLE "notification_rules" DROP CONSTRAINT "notification_rules_event";--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_source" CHECK ("notification_dispatches"."source_type" in ('invoice','estimate','payment','delivery_note','report_run'));--> statement-breakpoint
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_event" CHECK ("notification_dispatches"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder','report_available'));--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_event" CHECK ("notification_rules"."event_key" in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder'));--> statement-breakpoint
INSERT INTO notification_rules (event_key, enabled, locale, subject_template, body_template, body_format, english_subject_template, english_body_template)
VALUES ('delivery_prepared', false, 'company',
  'Slama Agricole — Bon de livraison {{documentNumber}}',
  '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Bonjour {{clientName}},</p><p>Votre bon de livraison {{documentNumber}}, prévu le {{deliveryDate}}, est disponible en pièce jointe.</p><p>Merci pour votre confiance.<br>L’équipe Slama Agricole</p></div>',
  'html', 'Slama Agricole — Delivery note {{documentNumber}}',
  '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Your delivery note {{documentNumber}}, scheduled for {{deliveryDate}}, is attached.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>')
ON CONFLICT (event_key) DO NOTHING;
