-- Owner-subscription overrides: append-only history, typed values, non-overlapping windows.
-- Effective window is [starts_at, least(ends_at, revoked_at)); revocation never erases history.
-- Times are database-authored: starts_at cannot precede the writing transaction, and revoked_at
-- must be the revoking transaction's time (one-minute tolerance), never before creation.
-- Functions qualify every table and pin search_path, so callers cannot redirect lookups.
CREATE FUNCTION guard_subscription_override() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 definition "public".entitlement_definitions%ROWTYPE;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION 'Subscription overrides are append-only' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
   OR (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') THEN
   RAISE EXCEPTION 'Only a single revocation may change an override' USING ERRCODE='23514';
  END IF;
  IF NEW.revoked_at<OLD.created_at OR NEW.revoked_at NOT BETWEEN now()-interval '1 minute' AND now()+interval '1 minute' THEN
   RAISE EXCEPTION 'Revocation time must be the current time' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 -- The overlap check below relies on a fresh snapshot after the lock (READ COMMITTED only).
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Override writes require READ COMMITTED isolation' USING ERRCODE='25001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text||':'||NEW.entitlement_key,44033));
 IF NEW.revoked_at IS NOT NULL OR NEW.created_at<>now() OR NEW.starts_at<now()-interval '1 minute' THEN
  RAISE EXCEPTION 'Overrides start now or later and are created unrevoked' USING ERRCODE='23514';
 END IF;
 IF NEW.replaces_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "public".subscription_overrides r
  WHERE r.id=NEW.replaces_id AND r.owner_id=NEW.owner_id AND r.entitlement_key=NEW.entitlement_key
   AND r.revoked_at IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'An amendment replaces a revoked override of the same owner and entitlement' USING ERRCODE='23514';
 END IF;
 SELECT * INTO definition FROM "public".entitlement_definitions WHERE key=NEW.entitlement_key;
 IF NEW.is_unlimited AND NOT definition.unlimited_allowed THEN
  RAISE EXCEPTION 'Entitlement % cannot be unlimited', NEW.entitlement_key USING ERRCODE='23514';
 END IF;
 IF NEW.entitlement_key='organizations' AND NEW.integer_value IS NOT NULL AND NEW.integer_value<1 THEN
  RAISE EXCEPTION 'Organization limit must be at least one' USING ERRCODE='23514';
 END IF;
 IF EXISTS (
  SELECT 1 FROM "public".subscription_overrides o
  WHERE o.owner_id=NEW.owner_id AND o.entitlement_key=NEW.entitlement_key AND o.id<>NEW.id
   AND o.starts_at<coalesce(NEW.ends_at,'infinity')
   AND least(coalesce(o.ends_at,'infinity'),coalesce(o.revoked_at,'infinity'))>NEW.starts_at
   AND least(coalesce(o.ends_at,'infinity'),coalesce(o.revoked_at,'infinity'))>o.starts_at
 ) THEN
  RAISE EXCEPTION 'Override window overlaps an existing override' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_override_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_overrides FOR EACH ROW EXECUTE FUNCTION guard_subscription_override();
--> statement-breakpoint
CREATE TRIGGER subscription_override_truncate BEFORE TRUNCATE ON subscription_overrides FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_override();
--> statement-breakpoint
-- Notes are append-only too: only the revocation fields may be filled, once, after the override
-- itself is revoked (so a note can never block a later revocation).
CREATE FUNCTION guard_subscription_override_note() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION 'Override notes are append-only' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' AND (NEW.revoked_by IS NOT NULL OR NEW.revocation_reason IS NOT NULL) THEN
  RAISE EXCEPTION 'Create notes before revoking' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revoked_by IS NOT NULL OR NEW.revoked_by IS NULL
   OR (to_jsonb(NEW)-'{revoked_by,revocation_reason}'::text[]) IS DISTINCT FROM (to_jsonb(OLD)-'{revoked_by,revocation_reason}'::text[]) THEN
   RAISE EXCEPTION 'Only a single revocation may change override notes' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "public".subscription_overrides o WHERE o.id=NEW.override_id AND o.revoked_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Revoke the override before recording its revocation note' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_override_note_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_override_notes FOR EACH ROW EXECUTE FUNCTION guard_subscription_override_note();
--> statement-breakpoint
CREATE TRIGGER subscription_override_note_truncate BEFORE TRUNCATE ON subscription_override_notes FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_override_note();
--> statement-breakpoint
-- At commit, every override has its administrator note, and every revoked override records who
-- revoked it and why.
CREATE FUNCTION require_subscription_override_note() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM "public".subscription_override_notes n
  WHERE n.override_id=NEW.id AND (NEW.revoked_at IS NULL OR n.revoked_by IS NOT NULL)
 ) THEN
  RAISE EXCEPTION 'An override requires an administrator note, including for its revocation' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER subscription_override_note_required AFTER INSERT OR UPDATE ON subscription_overrides DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_subscription_override_note();
