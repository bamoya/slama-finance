INSERT INTO permissions (key, description) VALUES ('staff.delete', 'Permanently delete unused staff accounts') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND r.is_system = true AND p.key = 'staff.delete'
ON CONFLICT DO NOTHING;
