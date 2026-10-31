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
CREATE FUNCTION assert_delivery_invoice_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE note_ids uuid[];
BEGIN
  IF TG_TABLE_NAME = 'delivery_notes' THEN
    note_ids := ARRAY[NEW.id];
  ELSIF TG_TABLE_NAME = 'delivery_note_lines' THEN
    note_ids := ARRAY[NEW.delivery_note_id];
  ELSIF TG_TABLE_NAME = 'delivery_invoice_allocations' THEN
    SELECT ARRAY[delivery_note_id] INTO note_ids FROM delivery_note_lines WHERE id=NEW.delivery_note_line_id;
  ELSE
    SELECT array_agg(DISTINCT dnl.delivery_note_id) INTO note_ids
      FROM delivery_note_lines dnl
      LEFT JOIN delivery_invoice_allocations dia ON dia.delivery_note_line_id=dnl.id
      WHERE dia.invoice_line_id=NEW.id OR dnl.source_invoice_line_id=NEW.id;
  END IF;
  PERFORM id FROM delivery_notes WHERE id=ANY(note_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM delivery_invoice_allocations dia
    JOIN invoice_lines il ON il.id=dia.invoice_line_id
    JOIN delivery_note_lines dnl ON dnl.id=dia.delivery_note_line_id
    JOIN delivery_notes dn ON dn.id=dnl.delivery_note_id
    WHERE dn.id=ANY(note_ids) AND dn.invoice_id IS DISTINCT FROM il.invoice_id
  ) OR EXISTS (
    SELECT 1 FROM delivery_note_lines dnl
    JOIN invoice_lines il ON il.id=dnl.source_invoice_line_id
    JOIN delivery_notes dn ON dn.id=dnl.delivery_note_id
    WHERE dn.id=ANY(note_ids) AND dn.invoice_id IS DISTINCT FROM il.invoice_id
  ) THEN
    RAISE EXCEPTION 'A delivery note can belong to only one invoice' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_allocation AFTER INSERT OR UPDATE ON delivery_invoice_allocations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_note AFTER INSERT OR UPDATE ON delivery_notes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_delivery_line AFTER INSERT OR UPDATE ON delivery_note_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_invoice_owner_after_invoice_line AFTER INSERT OR UPDATE ON invoice_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_delivery_invoice_owner();
--> statement-breakpoint
CREATE FUNCTION enforce_staff_scope_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_staff_uuid uuid;
DECLARE affected_role_uuid uuid;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN affected_staff_uuid := NEW.id;
  ELSIF TG_TABLE_NAME = 'roles' THEN affected_role_uuid := NEW.id;
  ELSE affected_staff_uuid := NEW.user_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM user_roles ur JOIN users u ON u.id=ur.user_id JOIN roles r ON r.id=ur.role_id
    WHERE (affected_staff_uuid IS NULL OR ur.user_id=affected_staff_uuid) AND (affected_role_uuid IS NULL OR ur.role_id=affected_role_uuid)
      AND (u.organization_id IS DISTINCT FROM r.organization_id)
  ) THEN RAISE EXCEPTION 'Staff and role must belong to the same organization' USING ERRCODE='23514'; END IF;
  IF affected_staff_uuid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.id=affected_staff_uuid AND s.organization_id IS DISTINCT FROM u.organization_id)
    OR EXISTS (SELECT 1 FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE u.id=affected_staff_uuid AND t.organization_id IS DISTINCT FROM u.organization_id)
  ) THEN RAISE EXCEPTION 'Staff credentials must belong to the same organization' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_role_scope AFTER INSERT OR UPDATE ON user_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_user_scope AFTER UPDATE OF organization_id ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_role_move_scope AFTER UPDATE OF organization_id ON roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_session_scope AFTER INSERT OR UPDATE OF user_id,organization_id ON sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER staff_reset_scope AFTER INSERT OR UPDATE OF user_id,organization_id ON password_reset_tokens DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_staff_scope_integrity();
