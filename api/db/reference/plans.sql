INSERT INTO subscription_plans(code,name,rank,monthly_ht,annual_ht,entitlements) VALUES
('trial','Essai gratuit 7 jours',0,0,0,'{"organizations":1,"staffPerOrganization":2,"storageBytes":1000000000,"businessEmails":50,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}'),
('essential','Essential',1,9900,99000,'{"organizations":1,"staffPerOrganization":1,"storageBytes":1000000000,"businessEmails":0,"features":[]}'),
('business','Business',2,29900,299000,'{"organizations":3,"staffPerOrganization":5,"storageBytes":10000000000,"businessEmails":2000,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}'),
('pro','Pro',3,79900,799000,'{"organizations":null,"staffPerOrganization":null,"storageBytes":50000000000,"businessEmails":10000,"features":["custom_templates","business_emails","scheduled_reports","report_exports","staff_roles","advanced_analytics","custom_domains"]}');
--> statement-breakpoint
INSERT INTO billing_settings(id) VALUES (1);
