-- Stable provenance projection: unrelated legacy columns must not change imported hashes.
-- Pure argument-only function, shared by import and diagnostics; no privileged table access.
CREATE FUNCTION subscription_catalog_snapshot(subscription_plans,text) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT jsonb_build_object('code',($1).code,'name',($1).name,'rank',($1).rank,
   'monthly_ht',($1).monthly_ht,'annual_ht',($1).annual_ht,
   'entitlements',($1).entitlements,'currency',$2)
$$;
--> statement-breakpoint
-- Lock before row acquisition, preventing publication/edit lock-order inversion.
CREATE FUNCTION lock_subscription_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(173027,32);
 IF TG_OP='TRUNCATE' OR NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  RAISE EXCEPTION 'Catalog write requires migration role; truncation is forbidden' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_definition_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON entitlement_definitions FOR EACH STATEMENT EXECUTE FUNCTION lock_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_version_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON plan_versions FOR EACH STATEMENT EXECUTE FUNCTION lock_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_entitlement_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON plan_entitlements FOR EACH STATEMENT EXECUTE FUNCTION lock_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_price_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON plan_version_prices FOR EACH STATEMENT EXECUTE FUNCTION lock_subscription_catalog();
--> statement-breakpoint
-- Inactive normalized catalog. Writes are restricted to the migration/table-owner role.
-- A small global transaction lock serializes publication, draft edits and definition changes.
CREATE FUNCTION guard_subscription_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 version_id uuid;
 version_state text;
 version_plan text;
 allowed boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(173027, 32);
 IF NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  RAISE EXCEPTION 'Catalog writes require the migration role' USING ERRCODE='42501';
 END IF;
 IF TG_OP='TRUNCATE' THEN
  RAISE EXCEPTION 'Catalog truncation is forbidden' USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='entitlement_definitions' THEN
  IF TG_OP<>'INSERT' AND EXISTS (
   SELECT 1 FROM plan_entitlements e JOIN plan_versions v ON v.id=e.plan_version_id
   WHERE e.entitlement_key=OLD.key AND v.status='published'
  ) THEN
   RAISE EXCEPTION 'Published entitlement definition is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='plan_versions' THEN
  IF TG_OP<>'INSERT' AND OLD.status='published' THEN
   RAISE EXCEPTION 'Published plan version is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW.status<>'draft' THEN
   RAISE EXCEPTION 'Create a draft before publishing' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.plan_code,NEW.version_number,NEW.created_at) IS DISTINCT FROM
      (OLD.id,OLD.plan_code,OLD.version_number,OLD.created_at) THEN
    RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE='23514';
   END IF;
   NEW.revision=OLD.revision+1;
   IF NEW.status='published' THEN
    NEW.published_at=clock_timestamp();
    IF (SELECT count(*) FROM plan_entitlements WHERE plan_version_id=NEW.id)<>11 OR
       EXISTS(SELECT 1 FROM unnest(ARRAY['organizations','staffPerOrganization','storageBytes','businessEmails',
         'custom_templates','business_emails','scheduled_reports','report_exports','staff_roles',
         'advanced_analytics','custom_domains']) k
         WHERE NOT EXISTS(SELECT 1 FROM plan_entitlements e WHERE e.plan_version_id=NEW.id AND e.entitlement_key=k)) THEN
     RAISE EXCEPTION 'Published version requires all eleven supported entitlements' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(*) FROM plan_version_prices WHERE plan_version_id=NEW.id)<>
       (CASE WHEN NEW.plan_code='trial' THEN 0 ELSE 2 END) THEN
     RAISE EXCEPTION 'Published paid version requires monthly and annual MAD prices; trial has no prices' USING ERRCODE='23514';
    END IF;
   END IF;
  END IF;
  IF TG_OP<>'DELETE' AND NEW.source_snapshot IS NOT NULL AND
     NEW.source_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.source_snapshot::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'Catalog provenance hash mismatch' USING ERRCODE='23514';
  END IF;
 ELSE
  -- Moving a child cannot evade the old version's immutability.
  IF TG_OP<>'INSERT' THEN
   SELECT status INTO version_state FROM plan_versions WHERE id=OLD.plan_version_id FOR UPDATE;
   IF version_state='published' THEN
    RAISE EXCEPTION 'Published version values and prices are immutable' USING ERRCODE='23514';
   END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
   version_id=NEW.plan_version_id;
   SELECT status,plan_code INTO version_state,version_plan FROM plan_versions WHERE id=version_id FOR UPDATE;
   IF version_state='published' THEN
    RAISE EXCEPTION 'Published version values and prices are immutable' USING ERRCODE='23514';
   END IF;
   IF TG_TABLE_NAME='plan_entitlements' THEN
    SELECT unlimited_allowed INTO allowed FROM entitlement_definitions
      WHERE key=NEW.entitlement_key AND value_type=NEW.value_type;
    IF NEW.is_unlimited AND allowed IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'Unlimited is forbidden for this entitlement' USING ERRCODE='23514';
    END IF;
    IF NEW.entitlement_key='organizations' AND NOT NEW.is_unlimited AND NEW.integer_value<1 THEN
     RAISE EXCEPTION 'Organization capacity must be positive' USING ERRCODE='23514';
    END IF;
   ELSIF version_plan='trial' THEN
    RAISE EXCEPTION 'Trial cannot have selling prices' USING ERRCODE='23514';
   END IF;
   UPDATE plan_versions SET revision=revision+1 WHERE id=version_id;
  END IF;
  IF TG_OP<>'INSERT' THEN
   IF TG_OP='DELETE' OR OLD.plan_version_id IS DISTINCT FROM NEW.plan_version_id THEN
    UPDATE plan_versions SET revision=revision+1 WHERE id=OLD.plan_version_id;
   END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION audit_catalog_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_actor text;
BEGIN
 IF NEW.status='published' AND OLD.status='draft' THEN
  -- Only the migration-role guard can reach publication; restore caller context afterward.
  previous_actor=current_setting('app.actor_type',true);
  PERFORM set_config('app.actor_type','platform_admin',true);
  INSERT INTO platform_admin_audit(actor,action,target_type,target_id,before,after)
  VALUES(NEW.published_by,'subscription_catalog.publish','plan_version',NEW.id::text,to_jsonb(OLD),to_jsonb(NEW)||jsonb_build_object(
    'publication_identity',jsonb_build_object('current_user',current_user::text,'session_user',session_user::text,
      'server_timestamp',NEW.published_at,'transaction_id',txid_current()::text,'declared_actor',NEW.published_by)));
  PERFORM set_config('app.actor_type',coalesce(previous_actor,''),true);
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_definition_guard BEFORE INSERT OR UPDATE OR DELETE ON entitlement_definitions FOR EACH ROW EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_version_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_versions FOR EACH ROW EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_entitlement_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_entitlements FOR EACH ROW EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_price_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_version_prices FOR EACH ROW EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_publication_audit AFTER UPDATE ON plan_versions FOR EACH ROW EXECUTE FUNCTION audit_catalog_publication();
--> statement-breakpoint
CREATE TRIGGER catalog_definition_no_truncate BEFORE TRUNCATE ON entitlement_definitions FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_version_no_truncate BEFORE TRUNCATE ON plan_versions FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_entitlement_no_truncate BEFORE TRUNCATE ON plan_entitlements FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
CREATE TRIGGER catalog_price_no_truncate BEFORE TRUNCATE ON plan_version_prices FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_catalog();
--> statement-breakpoint
ALTER TABLE entitlement_definitions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plan_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plan_entitlements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plan_version_prices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- S2 selling authority: migration role only, serialized with publication, audited in the same transaction.
CREATE TRIGGER catalog_selling_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON plan_selling FOR EACH STATEMENT EXECUTE FUNCTION lock_subscription_catalog();
--> statement-breakpoint
CREATE FUNCTION guard_plan_selling() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state text; previous_actor text;
BEGIN
 PERFORM pg_advisory_xact_lock(173027,32);
 IF TG_OP='DELETE' OR NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  RAISE EXCEPTION 'Selling changes require the migration role; deletion is forbidden' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.plan_code<>OLD.plan_code THEN
  RAISE EXCEPTION 'Selling plan identity is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW.plan_version_id IS NOT DISTINCT FROM OLD.plan_version_id THEN
  RAISE EXCEPTION 'Selling change does not change the selling version' USING ERRCODE='23514';
 END IF;
 IF NEW.plan_version_id IS NOT NULL THEN
  SELECT status INTO version_state FROM plan_versions WHERE id=NEW.plan_version_id AND plan_code=NEW.plan_code;
  IF version_state IS DISTINCT FROM 'published' THEN
   RAISE EXCEPTION 'Only a published version of the same plan can be sold' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.changed_at=clock_timestamp();
 previous_actor=current_setting('app.actor_type',true);
 PERFORM set_config('app.actor_type','platform_admin',true);
 INSERT INTO platform_admin_audit(actor,action,target_type,target_id,before,after)
 VALUES(NEW.changed_by,CASE WHEN NEW.plan_version_id IS NULL THEN 'subscription_catalog.withdraw' ELSE 'subscription_catalog.select' END,
  'plan_selling',NEW.plan_code,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW)||jsonb_build_object(
   'selling_identity',jsonb_build_object('current_user',current_user::text,'session_user',session_user::text,
     'transaction_id',txid_current()::text)));
 PERFORM set_config('app.actor_type',coalesce(previous_actor,''),true);
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER catalog_selling_guard BEFORE INSERT OR UPDATE OR DELETE ON plan_selling FOR EACH ROW EXECUTE FUNCTION guard_plan_selling();
--> statement-breakpoint
ALTER TABLE plan_selling FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Version pins. Composite keys keep plan code and version together; SQL-managed to avoid a schema import cycle.
ALTER TABLE owner_subscriptions ADD CONSTRAINT owner_subscriptions_trial_version_fk
 FOREIGN KEY (trial_plan_version_id,trial_plan_code) REFERENCES plan_versions(id,plan_code);
--> statement-breakpoint
ALTER TABLE subscription_payments ADD CONSTRAINT subscription_payments_version_fk
 FOREIGN KEY (plan_version_id,plan_code) REFERENCES plan_versions(id,plan_code);
--> statement-breakpoint
-- Trial start takes the selling trial version (fail closed when none); the pin never changes.
CREATE FUNCTION pin_subscription_trial_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.trial_plan_version_id IS NULL THEN
   SELECT plan_version_id INTO NEW.trial_plan_version_id FROM "public".plan_selling WHERE plan_code='trial';
   IF NEW.trial_plan_version_id IS NULL THEN
    RAISE EXCEPTION 'No trial plan version is on sale' USING ERRCODE='55000';
   END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM "public".plan_versions WHERE id=NEW.trial_plan_version_id AND status='published') THEN
   RAISE EXCEPTION 'A trial pin requires a published version' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.trial_plan_version_id IS DISTINCT FROM OLD.trial_plan_version_id OR NEW.trial_plan_code IS DISTINCT FROM OLD.trial_plan_code THEN
  RAISE EXCEPTION 'The trial version pin is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_subscription_trial_version BEFORE INSERT OR UPDATE ON owner_subscriptions FOR EACH ROW EXECUTE FUNCTION pin_subscription_trial_version();
--> statement-breakpoint
REVOKE ALL ON FUNCTION pin_subscription_trial_version() FROM PUBLIC;
--> statement-breakpoint
-- A payment pins a published paid version at submission (a withdrawn one stays valid); never repinned.
CREATE FUNCTION guard_subscription_payment_version() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.plan_code='trial' OR NOT EXISTS (SELECT 1 FROM "public".plan_versions WHERE id=NEW.plan_version_id AND status='published') THEN
   RAISE EXCEPTION 'A payment pins a published paid plan version' USING ERRCODE='23514';
  END IF;
 ELSIF (NEW.plan_version_id,NEW.plan_code) IS DISTINCT FROM (OLD.plan_version_id,OLD.plan_code) THEN
  RAISE EXCEPTION 'The payment version pin is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_payment_version BEFORE INSERT OR UPDATE ON subscription_payments FOR EACH ROW EXECUTE FUNCTION guard_subscription_payment_version();
