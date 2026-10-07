-- One grant now covers every report, export, schedule and run. Preserve access
-- for roles with any previous reporting grant before removing obsolete keys.
INSERT INTO permissions (key, description)
VALUES ('reports.read', 'Access all reports, exports and scheduled reports')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id
FROM role_permissions rp
JOIN permissions old ON old.id = rp.permission_id
CROSS JOIN permissions target
WHERE target.key = 'reports.read'
  AND (old.key LIKE 'reports.%' OR old.key LIKE 'report_schedules.%' OR old.key LIKE 'report_runs.%')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM permissions
WHERE key <> 'reports.read'
  AND (key LIKE 'reports.%' OR key LIKE 'report_schedules.%' OR key LIKE 'report_runs.%');
