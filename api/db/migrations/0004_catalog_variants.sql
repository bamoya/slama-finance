CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "category_name_nonblank" CHECK (length(trim("product_categories"."name")) > 0),
	CONSTRAINT "category_version_positive" CHECK ("product_categories"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"weight_g" integer NOT NULL,
	"price_per_item" numeric(18, 2) NOT NULL,
	"cost_per_item" numeric(18, 2),
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "variant_weight_positive" CHECK ("product_variants"."weight_g" > 0),
	CONSTRAINT "variant_price_nonnegative" CHECK ("product_variants"."price_per_item" >= 0),
	CONSTRAINT "variant_cost_nonnegative" CHECK ("product_variants"."cost_per_item" is null or "product_variants"."cost_per_item" >= 0),
	CONSTRAINT "variant_version_positive" CHECK ("product_variants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"image_asset_id" uuid,
	"suggested_vat_rate" numeric(5, 2),
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	CONSTRAINT "product_name_nonblank" CHECK (length(trim("products"."name")) > 0),
	CONSTRAINT "product_reference_nonblank" CHECK (length(trim("products"."reference")) > 0),
	CONSTRAINT "product_vat_range" CHECK ("products"."suggested_vat_rate" is null or ("products"."suggested_vat_rate" >= 0 and "products"."suggested_vat_rate" <= 100)),
	CONSTRAINT "product_version_positive" CHECK ("products"."version" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_normalized_name_unique" ON "product_categories" USING btree (lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_weight_unique" ON "product_variants" USING btree ("product_id","weight_g");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_reference_unique" ON "products" USING btree (lower(trim("reference")));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" USING btree ("category_id");
--> statement-breakpoint
-- Serialize direct variant writes on their parent, including writes outside the API.
CREATE FUNCTION lock_variant_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent_id := OLD.product_id;
  ELSE parent_id := NEW.product_id;
  END IF;
  PERFORM 1 FROM products WHERE id = parent_id FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.product_id <> NEW.product_id THEN
      PERFORM 1 FROM products WHERE id = OLD.product_id FOR UPDATE;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variant_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON product_variants
FOR EACH ROW EXECUTE FUNCTION lock_variant_product();
--> statement-breakpoint
-- Evaluated at commit so product and initial variants can be inserted together.
CREATE FUNCTION assert_product_has_active_variant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN parent_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN parent_id := OLD.product_id;
  ELSE parent_id := NEW.product_id;
  END IF;
  IF EXISTS (SELECT 1 FROM products WHERE id = parent_id)
     AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = parent_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'A product requires at least one active variant' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'product_variants' AND TG_OP = 'UPDATE' THEN
    IF OLD.product_id <> NEW.product_id
       AND EXISTS (SELECT 1 FROM products WHERE id = OLD.product_id)
       AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = OLD.product_id AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'A product requires at least one active variant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER product_requires_variant_after_create AFTER INSERT ON products
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_product_has_active_variant();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER product_requires_variant_after_change AFTER INSERT OR UPDATE OR DELETE ON product_variants
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_product_has_active_variant();
--> statement-breakpoint
INSERT INTO permissions (key, description) VALUES
('categories.read', 'View categories'), ('categories.create', 'Create categories'),
('categories.update', 'Edit categories'), ('categories.archive', 'Archive categories'),
('categories.restore', 'Restore categories'), ('categories.delete', 'Delete unused categories'),
('products.read', 'View products and variants'), ('products.create', 'Create products'),
('products.update', 'Edit products and variants'), ('products.archive', 'Archive products'),
('products.restore', 'Restore products'), ('products.delete', 'Delete unused products')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND (p.key LIKE 'categories.%' OR p.key LIKE 'products.%')
ON CONFLICT DO NOTHING;
