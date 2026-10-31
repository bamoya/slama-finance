CREATE FUNCTION register_account_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_owner text; previous_kind text; target_kind text;
BEGIN
 target_kind:=CASE WHEN TG_TABLE_NAME='users' THEN 'staff' ELSE 'owner' END;
 IF EXISTS(SELECT 1 FROM actors WHERE id=NEW.id AND kind<>target_kind) THEN
  RAISE EXCEPTION 'Actor identity collision' USING ERRCODE='23514';
 END IF;
 IF target_kind='owner' THEN
  previous_owner:=current_setting('app.owner_id',true);previous_kind:=current_setting('app.actor_type',true);
  PERFORM set_config('app.owner_id',NEW.id::text,true);PERFORM set_config('app.actor_type','owner',true);
  INSERT INTO actors(id,kind,owner_id) VALUES(NEW.id,'owner',NEW.id);
  PERFORM set_config('app.owner_id',coalesce(previous_owner,''),true);PERFORM set_config('app.actor_type',coalesce(previous_kind,''),true);
 ELSE
  INSERT INTO actors(id,kind,staff_id) VALUES(NEW.id,'staff',NEW.id);
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER register_owner_actor AFTER INSERT ON platform_users FOR EACH ROW EXECUTE FUNCTION register_account_actor();
--> statement-breakpoint
CREATE TRIGGER register_staff_actor AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION register_account_actor();
--> statement-breakpoint
CREATE FUNCTION enforce_actor_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE column_name text; target_id uuid; valid boolean; target_kind text;
BEGIN
 FOREACH column_name IN ARRAY TG_ARGV LOOP
  target_id:=(to_jsonb(NEW)->>column_name)::uuid;
  IF target_id IS NULL THEN CONTINUE; END IF;
  SELECT a.kind, ((a.kind='owner' AND a.owner_id=o.owner_id) OR (a.kind='staff' AND u.organization_id=o.id))
    INTO target_kind,valid FROM actors a CROSS JOIN organizations o LEFT JOIN users u ON u.id=a.staff_id WHERE a.id=target_id AND o.id=NEW.organization_id;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Actor must belong to the organization' USING ERRCODE='23503'; END IF;
  IF TG_TABLE_NAME='audit_events' AND column_name='actor_id' THEN NEW.actor_kind:=CASE WHEN target_kind='owner' THEN 'owner' ELSE 'user' END; END IF;
 END LOOP;
 RETURN NEW;
END $$;
