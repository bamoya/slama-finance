ALTER TABLE "estimates" DROP CONSTRAINT "estimates_status";--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "revision_of_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_revision_of_id_estimates_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "public"."estimates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estimates_revision_of_uq" ON "estimates" USING btree ("revision_of_id");--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_revision_not_self" CHECK ("estimates"."revision_of_id" is null or "estimates"."revision_of_id" <> "estimates"."id");--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_status" CHECK ("estimates"."status" in ('draft','issued','sent','accepted','rejected','expired','cancelled','superseded'));