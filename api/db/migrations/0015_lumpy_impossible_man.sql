ALTER TABLE "document_templates" DROP CONSTRAINT "template_layout";--> statement-breakpoint
ALTER TABLE "document_templates" ADD COLUMN "density" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "template_density" CHECK ("document_templates"."density" in ('standard','compact'));--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "template_layout" CHECK ("document_templates"."layout" in ('classic','modern','minimal','signature','atelier','ledger','essential'));
