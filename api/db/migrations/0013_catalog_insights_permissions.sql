INSERT INTO permissions (key, description) VALUES
('reports.read', 'View reports'),
('reports.sections.revenue', 'View revenue and sales figures in reports')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('reports.read', 'reports.sections.revenue')
ON CONFLICT DO NOTHING;
