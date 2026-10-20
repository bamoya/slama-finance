ALTER TABLE "delivery_notes" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "appearance_snapshot" jsonb DEFAULT '{"layout":"classic","density":"standard","accentColor":"#ad7d1d"}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
