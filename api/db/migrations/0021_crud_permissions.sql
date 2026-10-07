-- Consolidate technical actions into resource CRUD grants. This intentionally broadens
-- former narrow action grants to Edit; it never adds permanent Delete privileges.
INSERT INTO permissions (key, description) VALUES
('payments.update', 'Edit payments, confirm, cancel and restore'),
('notification_dispatches.update', 'Retry or cancel outbound notifications')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
--> statement-breakpoint
WITH mapping(old_key, new_key) AS (VALUES
('bank_accounts.archive', 'bank_accounts.update'),
('bank_accounts.restore', 'bank_accounts.update'),
('categories.archive', 'categories.update'),
('categories.restore', 'categories.update'),
('clients.archive', 'clients.update'),
('clients.restore', 'clients.update'),
('products.archive', 'products.update'),
('products.restore', 'products.update'),
('templates.archive', 'templates.update'),
('templates.restore', 'templates.update'),
('invoices.issue', 'invoices.update'),
('estimates.issue', 'estimates.update'),
('invoices.cancel', 'invoices.update'),
('estimates.cancel', 'estimates.update'),
('invoices.send', 'invoices.update'),
('estimates.send', 'estimates.update'),
('delivery_notes.prepare', 'delivery_notes.update'),
('delivery_notes.deliver', 'delivery_notes.update'),
('delivery_notes.acknowledge', 'delivery_notes.update'),
('delivery_notes.cancel', 'delivery_notes.update'),
('payments.confirm', 'payments.update'),
('payments.cancel', 'payments.update'),
('payments.restore', 'payments.update'),
('staff.disable', 'staff.update'),
('staff.enable', 'staff.update'),
('staff.archive', 'staff.update'),
('staff.reset_password', 'staff.update'),
('staff.assign_roles', 'staff.update'),
('templates.read_signature', 'templates.read'),
('templates.upload_signature', 'templates.update'),
('notification_rules.test', 'notification_rules.update'),
('notification_dispatches.retry', 'notification_dispatches.update'),
('notification_dispatches.cancel', 'notification_dispatches.update'),
('client_notification_preferences.delete', 'client_notification_preferences.update'),
('staff.assign_roles', 'roles.update')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, target.id FROM mapping m
JOIN permissions source ON source.key = m.old_key
JOIN role_permissions rp ON rp.permission_id = source.id
JOIN permissions target ON target.key = m.new_key
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM permissions WHERE key IN (
'bank_accounts.archive',
'bank_accounts.restore',
'categories.archive',
'categories.restore',
'clients.archive',
'clients.restore',
'products.archive',
'products.restore',
'templates.archive',
'templates.restore',
'invoices.issue',
'estimates.issue',
'invoices.cancel',
'estimates.cancel',
'invoices.send',
'estimates.send',
'delivery_notes.prepare',
'delivery_notes.deliver',
'delivery_notes.acknowledge',
'delivery_notes.cancel',
'payments.confirm',
'payments.cancel',
'payments.restore',
'staff.disable',
'staff.enable',
'staff.archive',
'staff.reset_password',
'staff.assign_roles',
'templates.read_signature',
'templates.upload_signature',
'notification_rules.test',
'notification_dispatches.retry',
'notification_dispatches.cancel',
'client_notification_preferences.delete'
);
--> statement-breakpoint
UPDATE permissions SET description =
CASE
  WHEN key = 'reports.read' THEN 'Access all reports, exports and scheduled reports'
  WHEN key LIKE '%.read' THEN 'View ' || replace(split_part(key, '.', 1), '_', ' ') || ' and download existing documents'
  WHEN key LIKE '%.create' THEN 'Create ' || replace(split_part(key, '.', 1), '_', ' ')
  WHEN key LIKE '%.update' THEN 'Edit ' || replace(split_part(key, '.', 1), '_', ' ') || ' and change their state'
  WHEN key LIKE '%.delete' THEN 'Permanently delete ' || replace(split_part(key, '.', 1), '_', ' ') || ' when allowed'
  ELSE description
END;
