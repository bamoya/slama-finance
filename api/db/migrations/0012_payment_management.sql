INSERT INTO permissions (key, description) VALUES
('payments.restore', 'Restore cancelled payments'),
('payments.delete', 'Delete payment records')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('payments.restore', 'payments.delete')
ON CONFLICT DO NOTHING;
