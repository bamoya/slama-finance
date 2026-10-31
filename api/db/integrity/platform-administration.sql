CREATE FUNCTION reject_platform_admin_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Platform administration audit is append-only' USING ERRCODE='42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER platform_admin_audit_append_only BEFORE UPDATE OR DELETE ON platform_admin_audit FOR EACH ROW EXECUTE FUNCTION reject_platform_admin_audit_change();
--> statement-breakpoint
CREATE TRIGGER platform_admin_audit_no_truncate BEFORE TRUNCATE ON platform_admin_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_platform_admin_audit_change();
--> statement-breakpoint
-- Coverage, plan and billing configuration change only through the administrator context.
-- The table owner (migrations, operator tooling) is exempt; the runtime role is not.
CREATE FUNCTION require_platform_admin_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('app.actor_type',true) IS DISTINCT FROM 'platform_admin'
   AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  IF TG_TABLE_NAME='owner_subscriptions' THEN
   -- Owners may only toggle cancellation; coverage and plan follow confirmed payments.
   IF to_jsonb(NEW)-'cancel_at_period_end' IS NOT DISTINCT FROM to_jsonb(OLD)-'cancel_at_period_end' THEN
    RETURN NEW;
   END IF;
  END IF;
  RAISE EXCEPTION 'Platform administrator context required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_subscriptions_admin_coverage BEFORE UPDATE ON owner_subscriptions FOR EACH ROW EXECUTE FUNCTION require_platform_admin_change();
--> statement-breakpoint
CREATE TRIGGER billing_settings_admin_only BEFORE UPDATE ON billing_settings FOR EACH ROW EXECUTE FUNCTION require_platform_admin_change();
--> statement-breakpoint
-- Organization addresses: a slug recorded as another organization's former address stays
-- unavailable, and only administrators rename an existing organization. SECURITY DEFINER reads
-- the history regardless of the caller's row policies; it returns no data to the caller.
CREATE FUNCTION guard_organization_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
  RETURN NEW;
 END IF;
 IF EXISTS (SELECT 1 FROM organization_slug_history h WHERE h.slug=NEW.slug AND h.organization_id<>NEW.id) THEN
  RAISE EXCEPTION 'Organization slug is unavailable' USING ERRCODE='23505', CONSTRAINT='organizations_slug_unique';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organizations_slug_guard BEFORE INSERT OR UPDATE OF slug ON organizations FOR EACH ROW EXECUTE FUNCTION guard_organization_slug();
--> statement-breakpoint
CREATE FUNCTION require_platform_admin_slug_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.slug IS DISTINCT FROM OLD.slug
   AND current_setting('app.actor_type',true) IS DISTINCT FROM 'platform_admin'
   AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid=TG_RELID),'MEMBER') THEN
  RAISE EXCEPTION 'Platform administrator context required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organizations_slug_admin_only BEFORE UPDATE OF slug ON organizations FOR EACH ROW EXECUTE FUNCTION require_platform_admin_slug_change();
