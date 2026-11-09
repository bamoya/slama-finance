-- Import the actual legacy catalog, not commercial defaults. This runs in the migration transaction.
LOCK TABLE subscription_plans IN SHARE MODE;
--> statement-breakpoint
LOCK TABLE billing_settings IN SHARE MODE;
--> statement-breakpoint
DO $$
DECLARE p record; k text; v jsonb;
BEGIN
 IF (SELECT count(*) FROM subscription_plans)<>4 OR EXISTS(
   SELECT 1 FROM subscription_plans WHERE code NOT IN ('trial','essential','business','pro')) THEN
  RAISE EXCEPTION 'Unsupported legacy plan codes: expected trial, essential, business and pro';
 END IF;
 IF (SELECT count(*) FROM billing_settings WHERE id=1 AND currency='MAD')<>1 THEN
  RAISE EXCEPTION 'Catalog import supports MAD only; review configured billing currency before rollout';
 END IF;
 FOR p IN SELECT * FROM subscription_plans LOOP
  IF btrim(p.name)='' OR p.rank<0 OR p.monthly_ht<0 OR p.annual_ht<0 OR
     jsonb_typeof(p.entitlements) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Malformed legacy catalog metadata for plan %',p.code;
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p.entitlements))<>5 OR
     NOT p.entitlements ?& ARRAY['organizations','staffPerOrganization','storageBytes','businessEmails','features'] THEN
   RAISE EXCEPTION 'Unknown or missing legacy entitlement keys for plan %',p.code;
  END IF;
  FOREACH k IN ARRAY ARRAY['organizations','staffPerOrganization','storageBytes','businessEmails'] LOOP
   v=p.entitlements->k;
   IF v='null'::jsonb AND k IN ('organizations','staffPerOrganization') THEN CONTINUE; END IF;
   IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid legacy limit % for plan %',k,p.code;
   END IF;
   IF v::numeric<(CASE WHEN k='organizations' THEN 1 ELSE 0 END) OR v::numeric>9007199254740991 OR trunc(v::numeric)<>v::numeric THEN
    RAISE EXCEPTION 'Invalid legacy integer % for plan %',k,p.code;
   END IF;
  END LOOP;
  IF jsonb_typeof(p.entitlements->'features') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Malformed legacy feature array for plan %',p.code;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.entitlements->'features') f WHERE jsonb_typeof(f)<>'string' OR
    f#>>'{}' NOT IN ('custom_templates','business_emails','scheduled_reports','report_exports','staff_roles','advanced_analytics','custom_domains')) OR
    (SELECT count(*)<>count(DISTINCT f) FROM jsonb_array_elements(p.entitlements->'features') f) THEN
   RAISE EXCEPTION 'Unknown or duplicate legacy feature for plan %',p.code;
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
INSERT INTO entitlement_definitions(key,value_type,unit,kind,scope,unlimited_allowed) VALUES
 ('organizations','integer','count','capacity','owner',true),
 ('staffPerOrganization','integer','count','capacity','organization',true),
 ('storageBytes','integer','byte','capacity','owner',false),
 ('businessEmails','integer','recipient','consumption','owner',false),
 ('custom_templates','boolean','flag','feature','organization',false),
 ('business_emails','boolean','flag','feature','organization',false),
 ('scheduled_reports','boolean','flag','feature','organization',false),
 ('report_exports','boolean','flag','feature','organization',false),
 ('staff_roles','boolean','flag','feature','organization',false),
 ('advanced_analytics','boolean','flag','feature','owner',false),
 ('custom_domains','boolean','flag','feature','organization',false);
--> statement-breakpoint
INSERT INTO plan_versions(plan_code,version_number,display_name,rank,source_snapshot,source_hash)
SELECT code,1,name,rank,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')
FROM (SELECT p.*,subscription_catalog_snapshot(p,b.currency) snapshot
      FROM subscription_plans p CROSS JOIN billing_settings b WHERE b.id=1) source;
--> statement-breakpoint
INSERT INTO plan_entitlements(plan_version_id,entitlement_key,value_type,boolean_value,integer_value,is_unlimited)
SELECT v.id,d.key,d.value_type,
 CASE WHEN d.value_type='boolean' THEN p.entitlements->'features' ? d.key END,
 CASE WHEN d.value_type='integer' AND p.entitlements->d.key<>'null'::jsonb THEN (p.entitlements->>d.key)::numeric::bigint END,
 d.value_type='integer' AND p.entitlements->d.key='null'::jsonb
FROM plan_versions v JOIN subscription_plans p ON p.code=v.plan_code CROSS JOIN entitlement_definitions d;
--> statement-breakpoint
INSERT INTO plan_version_prices(plan_version_id,cycle,currency,amount_ht_minor)
SELECT v.id,c.cycle,'MAD',CASE WHEN c.cycle='monthly' THEN p.monthly_ht ELSE p.annual_ht END
FROM plan_versions v JOIN subscription_plans p ON p.code=v.plan_code
CROSS JOIN (VALUES ('monthly'),('annual')) c(cycle) WHERE p.code<>'trial';
--> statement-breakpoint
UPDATE plan_versions SET status='published',published_at=now(),published_by='migration:subscription-catalog-v1';
