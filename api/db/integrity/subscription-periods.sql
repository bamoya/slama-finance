-- S5 coverage periods: append-only, database-authored creation time, per-owner serialized checks.
-- Effective window: [starts_at, coalesce(superseded_at, ends_at)). Functions qualify every table and
-- pin search_path; the test fixture rewrites the "public". prefix to its own schema.
CREATE FUNCTION guard_subscription_period() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE payment_version uuid;
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION 'Subscription periods are append-only' USING ERRCODE='42501';
 END IF;
 -- Coverage checks run deferred under this lock with fresh READ COMMITTED snapshots. Trial periods
 -- never take part in overlap checks (they mirror the legacy trial window in any isolation level).
 IF NEW.kind<>'trial' AND current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Period writes require READ COMMITTED isolation' USING ERRCODE='25001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_id::text||':periods',44034));
 IF TG_OP='UPDATE' THEN
  -- Window changes only through the controlled SECURITY DEFINER functions (table owner): the trial
  -- mirror and the suspension shift. Everyone else may only record a single supersession.
  IF pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER')
   AND (to_jsonb(NEW)-'{starts_at,ends_at,superseded_at}'::text[]) IS NOT DISTINCT FROM (to_jsonb(OLD)-'{starts_at,ends_at,superseded_at}'::text[])
   AND (OLD.superseded_at IS NULL) IS NOT DISTINCT FROM (NEW.superseded_at IS NULL) THEN
   RETURN NEW;
  END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL
   OR (to_jsonb(NEW)-'{superseded_at,superseded_by}'::text[]) IS DISTINCT FROM (to_jsonb(OLD)-'{superseded_at,superseded_by}'::text[]) THEN
   RAISE EXCEPTION 'Only a single supersession may change a period' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.created_at<>now() THEN
  RAISE EXCEPTION 'Period creation time is set by the database' USING ERRCODE='23514';
 END IF;
 -- Version pin (immutable afterwards through the update rules above): a period with a payment
 -- carries exactly that payment's pin; every pin names a published version (withdrawn is fine).
 IF NEW.payment_id IS NOT NULL THEN
  SELECT plan_version_id INTO payment_version FROM "public".subscription_payments WHERE id=NEW.payment_id;
  IF NEW.plan_version_id IS NULL THEN
   NEW.plan_version_id := payment_version;
  ELSIF NEW.plan_version_id IS DISTINCT FROM payment_version THEN
   RAISE EXCEPTION 'A period pins the version of its payment' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "public".plan_versions v WHERE v.id=NEW.plan_version_id AND v.plan_code=NEW.plan_code AND v.status='published') THEN
  RAISE EXCEPTION 'A period pins a published version of its plan' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_period_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_periods FOR EACH ROW EXECUTE FUNCTION guard_subscription_period();
--> statement-breakpoint
CREATE TRIGGER subscription_period_truncate BEFORE TRUNCATE ON subscription_periods FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_period();
--> statement-breakpoint
-- At commit (current row state): superseding period is a later non-trial period of the same owner
-- starting exactly at the supersession; non-trial effective windows never overlap; complimentary
-- periods carry an administrator note.
CREATE FUNCTION check_subscription_period() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 cur "public".subscription_periods%ROWTYPE;
BEGIN
 SELECT * INTO cur FROM "public".subscription_periods WHERE id=NEW.id;
 IF cur.superseded_by IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "public".subscription_periods p
  WHERE p.id=cur.superseded_by AND p.owner_id=cur.owner_id AND p.kind<>'trial' AND p.starts_at=cur.superseded_at
 ) THEN
  RAISE EXCEPTION 'A period is superseded by a later period of the same owner starting at the supersession' USING ERRCODE='23514';
 END IF;
 IF cur.kind<>'trial' AND EXISTS (
  SELECT 1 FROM "public".subscription_periods o
  WHERE o.owner_id=cur.owner_id AND o.id<>cur.id AND o.kind<>'trial'
   AND o.starts_at<coalesce(cur.superseded_at,cur.ends_at)
   AND coalesce(o.superseded_at,o.ends_at)>cur.starts_at
 ) THEN
  RAISE EXCEPTION 'Coverage periods overlap' USING ERRCODE='23P01';
 END IF;
 IF cur.kind='complimentary' AND NOT EXISTS (SELECT 1 FROM "public".subscription_period_notes n WHERE n.period_id=cur.id) THEN
  RAISE EXCEPTION 'A complimentary period requires an administrator note' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER subscription_period_check AFTER INSERT OR UPDATE ON subscription_periods DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_subscription_period();
--> statement-breakpoint
-- Notes, suspensions and scheduled changes: no deletion; only their single allowed transition.
CREATE FUNCTION guard_subscription_period_history() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='42501';
 END IF;
 IF TG_TABLE_NAME='subscription_period_notes' THEN
  IF TG_OP='UPDATE' THEN
   RAISE EXCEPTION 'Period notes are immutable' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='subscription_suspensions' THEN
  IF TG_OP='INSERT' AND (NEW.created_at<>now() OR NEW.started_at>now()+interval '1 minute' OR NEW.ended_at IS NOT NULL) THEN
   RAISE EXCEPTION 'A suspension starts now or earlier and is created open' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
   OR NEW.ended_at NOT BETWEEN now()-interval '1 minute' AND now()+interval '1 minute'
   OR (to_jsonb(NEW)-'{ended_at,shifted_by_ms}'::text[]) IS DISTINCT FROM (to_jsonb(OLD)-'{ended_at,shifted_by_ms}'::text[])) THEN
   RAISE EXCEPTION 'Only a single resume at the current time may change a suspension' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='subscription_scheduled_changes' THEN
  IF TG_OP='INSERT' AND (NEW.created_at<>now() OR NEW.status<>'scheduled') THEN
   RAISE EXCEPTION 'Scheduled changes are created now, in scheduled status' USING ERRCODE='23514';
  END IF;
  -- A version transition targets a published version; publication never creates or retargets one.
  IF TG_OP='INSERT' AND NEW.kind='version_transition' AND NOT EXISTS (
   SELECT 1 FROM "public".plan_versions v WHERE v.id=NEW.target_plan_version_id AND v.status='published') THEN
   RAISE EXCEPTION 'A version transition targets a published version' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
   -- The suspension shift (table owner, SECURITY DEFINER) moves pending boundaries only.
   IF pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER')
    AND OLD.status='scheduled' AND NEW.status='scheduled'
    AND (to_jsonb(NEW)-'effective_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'effective_at') THEN
    RETURN NEW;
   END IF;
   IF OLD.status<>'scheduled' OR NEW.status='scheduled'
    OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Only a single status transition may change a scheduled change' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER subscription_period_note_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_period_notes FOR EACH ROW EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
CREATE TRIGGER subscription_period_note_truncate BEFORE TRUNCATE ON subscription_period_notes FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
CREATE TRIGGER subscription_suspension_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_suspensions FOR EACH ROW EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
CREATE TRIGGER subscription_suspension_truncate BEFORE TRUNCATE ON subscription_suspensions FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
CREATE TRIGGER subscription_scheduled_change_guard BEFORE INSERT OR UPDATE OR DELETE ON subscription_scheduled_changes FOR EACH ROW EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
CREATE TRIGGER subscription_scheduled_change_truncate BEFORE TRUNCATE ON subscription_scheduled_changes FOR EACH STATEMENT EXECUTE FUNCTION guard_subscription_period_history();
--> statement-breakpoint
-- Trial periods mirror the legacy trial window (creation, administrator extension, resume shift),
-- whatever path creates the subscription (organization provisioning, owner start, administrator).
CREATE FUNCTION mirror_subscription_trial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.trial_started_at=OLD.trial_started_at AND NEW.trial_ends_at=OLD.trial_ends_at THEN
  RETURN NULL;
 END IF;
 UPDATE "public".subscription_periods SET starts_at=NEW.trial_started_at, ends_at=NEW.trial_ends_at
 WHERE owner_id=NEW.owner_id AND kind='trial';
 IF NOT FOUND THEN
  INSERT INTO "public".subscription_periods(owner_id,kind,plan_code,plan_version_id,starts_at,ends_at,source)
  VALUES (NEW.owner_id,'trial','trial',NEW.trial_plan_version_id,NEW.trial_started_at,NEW.trial_ends_at,'trial');
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_subscription_trial_period AFTER INSERT OR UPDATE OF trial_started_at, trial_ends_at ON owner_subscriptions FOR EACH ROW EXECUTE FUNCTION mirror_subscription_trial();
--> statement-breakpoint
REVOKE ALL ON FUNCTION mirror_subscription_trial() FROM PUBLIC;
--> statement-breakpoint
-- Resume: the only path that moves coverage periods. Same rule as the legacy shift of payments:
-- a coverage period still running at p_since ends p_shift_ms later and starts later only if it had not
-- started; supersessions at or after p_since and pending scheduled changes after p_since move too.
-- The trial is shifted by the legacy row and mirrored. The suspension closes at p_since + shift (the
-- application clock), so the recorded window always equals the applied shift. An ended paid period
-- still in grace at p_since also moves, so the paid grace resolver keeps exactly the remaining time.
CREATE FUNCTION subscription_periods_shift(p_owner uuid, p_since timestamptz, p_shift_ms bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 delta interval := p_shift_ms * interval '1 millisecond';
 grace_period uuid;
BEGIN
 IF current_setting('app.actor_type',true) IS DISTINCT FROM 'platform_admin' THEN
  RAISE EXCEPTION 'Platform administrator context required' USING ERRCODE='42501';
 END IF;
 IF p_shift_ms IS NULL OR p_shift_ms<0 THEN
  RAISE EXCEPTION 'The shift must be a non-negative duration' USING ERRCODE='23514';
 END IF;
 -- Freeze only remaining paid grace, never expired complimentary/cancelled coverage. Choose
 -- the same latest effective period as the resolver (including its later-start tie break).
 SELECT p.id INTO grace_period
 FROM "public".subscription_periods p
 WHERE p.owner_id=p_owner AND p.kind<>'trial'
   AND NOT EXISTS (SELECT 1 FROM "public".subscription_scheduled_changes c
                   WHERE c.owner_id=p_owner AND c.kind='cancel' AND c.status='scheduled')
 ORDER BY coalesce(p.superseded_at,p.ends_at) DESC, p.starts_at DESC LIMIT 1;
 IF NOT EXISTS (SELECT 1 FROM "public".subscription_periods p
                WHERE p.id=grace_period AND p.kind='paid' AND p.superseded_at IS NULL
                  AND p.ends_at<=p_since AND p.ends_at + interval '168 hours'>p_since) THEN
  grace_period := NULL;
 END IF;
 -- p_since is the legacy suspension start (authoritative while both models are written); it must
 -- equal the open suspension's start, otherwise the two histories disagree and nothing is shifted.
 UPDATE "public".subscription_suspensions SET ended_at=p_since+delta, shifted_by_ms=p_shift_ms
 WHERE owner_id=p_owner AND ended_at IS NULL AND started_at=p_since;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'No open suspension started at % (owner %): legacy and period suspension histories disagree', p_since, p_owner USING ERRCODE='23514';
 END IF;
 UPDATE "public".subscription_periods SET
  starts_at=CASE WHEN starts_at>=p_since THEN starts_at+delta ELSE starts_at END,
  ends_at=ends_at+delta,
  superseded_at=CASE WHEN superseded_at>=p_since THEN superseded_at+delta ELSE superseded_at END
 WHERE owner_id=p_owner AND kind<>'trial' AND (ends_at>p_since OR id=grace_period);
 UPDATE "public".subscription_scheduled_changes SET effective_at=effective_at+delta
 WHERE owner_id=p_owner AND status='scheduled' AND effective_at>p_since;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION subscription_periods_shift(uuid,timestamptz,bigint) FROM PUBLIC;
--> statement-breakpoint
-- Forward-only reconciliation from the legacy model (operator catch-up after legacy-only writes,
-- SUBSCRIPTION_PERIOD_WRITES=off); fresh installations need no backfill. New owners get a full build; existing owners get appended payments, suspensions
-- and cancellation changes. It aborts with the owner id on any shape it cannot map without guessing,
-- never modifies legacy rows, and is idempotent. Legacy tables use FORCE ROW LEVEL SECURITY: it reads
-- them as platform administrator, whose policies are unconditional (verified below, no DDL), takes the
-- legacy writers' per-owner lock and re-reads each owner, and checks at the end that every subscription
-- and confirmed payment it processed is represented.
CREATE FUNCTION subscription_periods_reconcile(actor text DEFAULT 'platform_admin') RETURNS integer LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 s "public".owner_subscriptions%ROWTYPE;
 p "public".subscription_payments%ROWTYPE;
 existing "public".subscription_periods%ROWTYPE;
 period_kind text;
 new_id uuid;
 last_id uuid;
 last_start timestamptz;
 last_end timestamptz;
 payments integer;
 changed integer := 0;
 touched boolean;
 processed uuid[] := '{}';
 previous_actor text := current_setting('app.actor_type',true);
 open_suspension "public".subscription_suspensions%ROWTYPE;
 cancel "public".subscription_scheduled_changes%ROWTYPE;
BEGIN
 PERFORM set_config('app.actor_type',coalesce(actor,''),true);
 IF current_setting('app.actor_type',true) IS DISTINCT FROM 'platform_admin' THEN
  RAISE EXCEPTION 'S5 reconcile: legacy rows must be read as platform administrator (FORCE ROW LEVEL SECURITY)' USING ERRCODE='42501';
 END IF;
 -- Full visibility relies on the unconditional administrator policies and no restrictive policy.
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='"public".owner_subscriptions'::regclass AND polname='subscription_admin'
      AND polcmd='*' AND polpermissive
      AND pg_get_expr(polqual,polrelid)='(current_setting(''app.actor_type''::text, true) = ''platform_admin''::text)')<>1
  OR (SELECT count(*) FROM pg_policy WHERE polrelid='"public".subscription_payments'::regclass AND polname='subscription_payment_admin'
      AND polcmd='*' AND polpermissive
      AND pg_get_expr(polqual,polrelid)='(current_setting(''app.actor_type''::text, true) = ''platform_admin''::text)')<>1
  OR EXISTS (SELECT 1 FROM pg_policy WHERE NOT polpermissive
      AND polrelid IN ('"public".owner_subscriptions'::regclass,'"public".subscription_payments'::regclass)) THEN
  RAISE EXCEPTION 'S5 reconcile: administrator read policies on legacy subscription tables are missing or changed' USING ERRCODE='42501';
 END IF;
 IF EXISTS (
  SELECT 1 FROM "public".subscription_payments x
  WHERE x.status='confirmed' AND NOT EXISTS (SELECT 1 FROM "public".owner_subscriptions o WHERE o.owner_id=x.owner_id)
 ) THEN
  RAISE EXCEPTION 'S5 reconcile: confirmed payment without a subscription (owner %)', (
   SELECT x.owner_id FROM "public".subscription_payments x
   WHERE x.status='confirmed' AND NOT EXISTS (SELECT 1 FROM "public".owner_subscriptions o WHERE o.owner_id=x.owner_id)
   ORDER BY x.owner_id LIMIT 1);
 END IF;
 FOR s IN SELECT * FROM "public".owner_subscriptions ORDER BY owner_id LOOP
  -- Same per-owner lock as the legacy writers (subscription.repository lock), then a fresh read, so
  -- every period, suspension and cancellation comes from one consistent legacy state.
  PERFORM pg_advisory_xact_lock(hashtextextended(s.owner_id::text,44032));
  SELECT * INTO s FROM "public".owner_subscriptions WHERE owner_id=s.owner_id;
  CONTINUE WHEN NOT FOUND;
  processed := processed || s.owner_id;
  touched := false;
  -- Trial: created once; a changed legacy trial window (extension/resume) cannot be appended.
  SELECT * INTO existing FROM "public".subscription_periods WHERE owner_id=s.owner_id AND kind='trial';
  IF NOT FOUND THEN
   IF EXISTS (SELECT 1 FROM "public".subscription_periods x WHERE x.owner_id=s.owner_id) THEN
    RAISE EXCEPTION 'S5 reconcile: periods without a trial period (owner %)', s.owner_id;
   END IF;
   INSERT INTO "public".subscription_periods(owner_id,kind,plan_code,plan_version_id,starts_at,ends_at,source)
   VALUES (s.owner_id,'trial','trial',s.trial_plan_version_id,s.trial_started_at,s.trial_ends_at,'migration');
   touched := true;
  ELSIF existing.starts_at<>s.trial_started_at OR existing.ends_at<>s.trial_ends_at THEN
   RAISE EXCEPTION 'S5 reconcile: trial window changed since the backfill (owner %)', s.owner_id;
  END IF;
  -- Latest coverage period so far (appending continues from it).
  SELECT * INTO existing FROM "public".subscription_periods
  WHERE owner_id=s.owner_id AND kind<>'trial' ORDER BY starts_at DESC, created_at DESC LIMIT 1;
  IF FOUND THEN
   last_id := existing.id; last_start := existing.starts_at; last_end := existing.ends_at;
  ELSE
   last_id := NULL; last_start := NULL; last_end := NULL;
  END IF;
  payments := 0;
  FOR p IN SELECT * FROM "public".subscription_payments
   WHERE owner_id=s.owner_id AND status='confirmed' ORDER BY coverage_start, coverage_end, id LOOP
   payments := payments+1;
   SELECT * INTO existing FROM "public".subscription_periods WHERE payment_id=p.id;
   IF FOUND THEN
    IF existing.starts_at<>p.coverage_start OR existing.ends_at<>p.coverage_end THEN
     RAISE EXCEPTION 'S5 reconcile: coverage of payment % changed since the backfill (owner %)', p.id, s.owner_id;
    END IF;
    CONTINUE;
   END IF;
   IF EXISTS (SELECT 1 FROM "public".subscription_periods x WHERE x.owner_id=s.owner_id AND x.kind='complimentary' AND x.payment_id IS NULL AND x.source='migration') THEN
    RAISE EXCEPTION 'S5 reconcile: payment % after a converted paid-through marker (owner %)', p.id, s.owner_id;
   END IF;
   IF p.method='admin_adjustment' THEN period_kind := 'complimentary';
   ELSIF p.amount_ttc>0 THEN period_kind := 'paid';
   ELSE RAISE EXCEPTION 'S5 reconcile: zero-amount payment % is not an administrator adjustment (owner %)', p.id, s.owner_id;
   END IF;
   IF last_start IS NOT NULL AND (p.coverage_start<last_start
    OR (p.coverage_start<last_end AND (p.coverage_start=last_start OR p.coverage_end<last_end))) THEN
    RAISE EXCEPTION 'S5 reconcile: ambiguous overlapping coverage % (owner %)', p.id, s.owner_id;
   END IF;
   INSERT INTO "public".subscription_periods(owner_id,kind,plan_code,plan_version_id,cycle,starts_at,ends_at,source,payment_id)
   VALUES (s.owner_id,period_kind,p.plan_code,p.plan_version_id,p.cycle,p.coverage_start,p.coverage_end,'migration',p.id)
   RETURNING id INTO new_id;
   IF period_kind='complimentary' THEN
    INSERT INTO "public".subscription_period_notes(period_id,reason)
    VALUES (new_id,'Converted from administrator adjustment payment '||p.id);
   END IF;
   -- Later-starting coverage wins on overlap (legacy upgrade rule): supersede the rest.
   IF last_end IS NOT NULL AND p.coverage_start<last_end THEN
    UPDATE "public".subscription_periods SET superseded_at=p.coverage_start, superseded_by=new_id WHERE id=last_id;
   END IF;
   last_id := new_id; last_start := p.coverage_start; last_end := p.coverage_end;
   touched := true;
  END LOOP;
  -- Legacy marker: only without any coverage (payments or S5b administrator grants), as the legacy
  -- resolver's fallback.
  IF payments=0 AND s.plan_code<>'trial' AND s.paid_through_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "public".subscription_periods g WHERE g.owner_id=s.owner_id AND g.source='admin_grant') THEN
   SELECT * INTO existing FROM "public".subscription_periods
   WHERE owner_id=s.owner_id AND kind='complimentary' AND payment_id IS NULL AND source='migration';
   IF FOUND THEN
    IF existing.ends_at<>s.paid_through_at OR existing.plan_code<>s.plan_code THEN
     RAISE EXCEPTION 'S5 reconcile: legacy paid-through marker changed since the backfill (owner %)', s.owner_id;
    END IF;
   ELSE
    -- No version can be inferred for a marker without a payment: refuse instead of guessing.
    RAISE EXCEPTION 'S5 reconcile: legacy paid-through marker has no version pin (owner %)', s.owner_id;
    IF s.paid_through_at<=s.trial_started_at THEN
     RAISE EXCEPTION 'S5 reconcile: legacy paid-through before the trial start (owner %)', s.owner_id;
    END IF;
    INSERT INTO "public".subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source)
    VALUES (s.owner_id,'complimentary',s.plan_code,s.trial_started_at,s.paid_through_at,'migration')
    RETURNING id INTO new_id;
    INSERT INTO "public".subscription_period_notes(period_id,reason)
    VALUES (new_id,'Converted from legacy paid-through marker');
    touched := true;
   END IF;
   last_end := s.paid_through_at;
  END IF;
  -- Suspension: append a new one; a legacy resume shifted coverage and cannot be replayed here.
  SELECT * INTO open_suspension FROM "public".subscription_suspensions WHERE owner_id=s.owner_id AND ended_at IS NULL;
  IF s.suspended_at IS NOT NULL THEN
   IF s.suspended_at>now() THEN
    RAISE EXCEPTION 'S5 reconcile: suspension starts in the future (owner %)', s.owner_id;
   END IF;
   IF NOT FOUND THEN
    INSERT INTO "public".subscription_suspensions(owner_id,started_at) VALUES (s.owner_id,s.suspended_at);
    touched := true;
   ELSIF open_suspension.started_at<>s.suspended_at THEN
    RAISE EXCEPTION 'S5 reconcile: suspension changed since the backfill (owner %)', s.owner_id;
   END IF;
  ELSIF FOUND THEN
   RAISE EXCEPTION 'S5 reconcile: subscription resumed since the backfill (owner %)', s.owner_id;
  END IF;
  -- Paid-through: the latest end of all coverage (payments, grants, markers).
  SELECT max(coalesce(superseded_at,ends_at)) INTO last_end FROM "public".subscription_periods
  WHERE owner_id=s.owner_id AND kind<>'trial';
  -- Cancellation at period end (no effect without coverage, as in the legacy resolver).
  SELECT * INTO cancel FROM "public".subscription_scheduled_changes
  WHERE owner_id=s.owner_id AND kind='cancel' AND status='scheduled';
  IF s.cancel_at_period_end AND last_end IS NOT NULL THEN
   IF NOT FOUND THEN
    INSERT INTO "public".subscription_scheduled_changes(owner_id,kind,effective_at,created_by)
    VALUES (s.owner_id,'cancel',last_end,'migration');
    touched := true;
   ELSIF cancel.effective_at<>last_end THEN
    RAISE EXCEPTION 'S5 reconcile: scheduled cancellation no longer matches coverage (owner %)', s.owner_id;
   END IF;
  ELSIF FOUND AND NOT s.cancel_at_period_end THEN
   UPDATE "public".subscription_scheduled_changes SET status='cancelled' WHERE id=cancel.id;
   touched := true;
  END IF;
  IF touched THEN changed := changed+1; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM unnest(processed) o(id)
  WHERE NOT EXISTS (SELECT 1 FROM "public".subscription_periods t WHERE t.owner_id=o.id AND t.kind='trial')) THEN
  RAISE EXCEPTION 'S5 reconcile: not every subscription has a trial period';
 END IF;
 -- Every confirmed payment of a processed owner maps to exactly one period (paid, or complimentary
 -- for administrator adjustments; supersession keeps the row). payment_id is unique.
 IF EXISTS (SELECT 1 FROM "public".subscription_payments x
  WHERE x.status='confirmed' AND x.owner_id=ANY(processed)
   AND NOT EXISTS (SELECT 1 FROM "public".subscription_periods m WHERE m.payment_id=x.id)) THEN
  RAISE EXCEPTION 'S5 reconcile: confirmed payment without a period (owner %)', (
   SELECT x.owner_id FROM "public".subscription_payments x
   WHERE x.status='confirmed' AND x.owner_id=ANY(processed)
    AND NOT EXISTS (SELECT 1 FROM "public".subscription_periods m WHERE m.payment_id=x.id)
   ORDER BY x.owner_id LIMIT 1);
 END IF;
 PERFORM set_config('app.actor_type',coalesce(previous_actor,''),true);
 RETURN changed;
END $$;
--> statement-breakpoint
-- Operator-only (migration role); never callable by the runtime.
REVOKE ALL ON FUNCTION subscription_periods_reconcile(text) FROM PUBLIC;
