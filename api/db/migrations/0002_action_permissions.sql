-- Preserve existing grants while replacing legacy aliases and broad management grants.
-- New restore/delete abilities are explicitly granted to Administrator only.
INSERT INTO permissions (key, description) VALUES
('company_settings.read', 'Read company settings and logos'),
('company_settings.update', 'Update company settings and upload logos'),
('roles.create', 'Create roles'),
('roles.update', 'Update role permissions'),
('roles.delete', 'Delete non-system roles'),
('staff.create', 'Create staff accounts'),
('staff.update', 'Update staff profiles'),
('staff.assign_roles', 'Assign staff roles'),
('staff.disable', 'Disable staff accounts'),
('staff.enable', 'Enable staff accounts'),
('staff.archive', 'Archive staff accounts'),
('staff.reset_password', 'Reissue staff temporary passwords'),
('bank_accounts.read', 'Read bank accounts'),
('bank_accounts.create', 'Create bank accounts'),
('bank_accounts.update', 'Update bank accounts'),
('bank_accounts.archive', 'Archive bank accounts'),
('bank_accounts.restore', 'Restore bank accounts'),
('bank_accounts.delete', 'Delete unreferenced bank accounts'),
('templates.read', 'Read and preview templates'),
('templates.create', 'Create templates'),
('templates.update', 'Update templates'),
('templates.archive', 'Archive templates'),
('templates.delete', 'Delete unreferenced templates'),
('templates.read_signature', 'Read private signatures'),
('templates.upload_signature', 'Upload private signatures')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint
WITH mapping(old_key, new_key) AS (VALUES
('settings.view', 'company_settings.read'),
('settings.update', 'company_settings.update'),
('bank_accounts.view', 'bank_accounts.read'),
('templates.view', 'templates.read'),
('roles.manage', 'roles.create'),
('roles.manage', 'roles.update'),
('roles.manage', 'roles.delete'),
('staff.manage', 'staff.create'),
('staff.manage', 'staff.update'),
('staff.manage', 'staff.assign_roles'),
('staff.manage', 'staff.disable'),
('staff.manage', 'staff.enable'),
('staff.manage', 'staff.archive'),
('staff.manage', 'staff.reset_password'),
('bank_accounts.manage', 'bank_accounts.create'),
('bank_accounts.manage', 'bank_accounts.update'),
('bank_accounts.manage', 'bank_accounts.archive'),
('templates.manage', 'templates.create'),
('templates.manage', 'templates.update'),
('templates.manage', 'templates.archive'),
('templates.manage', 'templates.read_signature'),
('templates.manage', 'templates.upload_signature')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, target.id FROM mapping m
JOIN permissions source ON source.key = m.old_key
JOIN role_permissions rp ON rp.permission_id = source.id
JOIN permissions target ON target.key = m.new_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM permissions WHERE key IN ('settings.view', 'settings.update', 'bank_accounts.view', 'templates.view', 'roles.manage', 'staff.manage', 'bank_accounts.manage', 'templates.manage');
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('bank_accounts.restore', 'bank_accounts.delete', 'templates.delete')
ON CONFLICT DO NOTHING;
