-- Required installation defaults only. No demo users, products or documents.
INSERT INTO permissions (key, description) VALUES
  ('bank_accounts.create', 'Create bank accounts'),
  ('bank_accounts.delete', 'Permanently delete bank accounts when allowed'),
  ('bank_accounts.read', 'View bank accounts and download existing documents'),
  ('bank_accounts.update', 'Edit bank accounts and change their state'),
  ('categories.create', 'Create categories'),
  ('categories.delete', 'Permanently delete categories when allowed'),
  ('categories.read', 'View categories and download existing documents'),
  ('categories.update', 'Edit categories and change their state'),
  ('client_notification_preferences.read', 'View client notification preferences and download existing documents'),
  ('client_notification_preferences.update', 'Edit client notification preferences and change their state'),
  ('clients.create', 'Create clients'),
  ('clients.delete', 'Permanently delete clients when allowed'),
  ('clients.read', 'View clients and download existing documents'),
  ('clients.update', 'Edit clients and change their state'),
  ('company_settings.read', 'View company settings and download existing documents'),
  ('company_settings.update', 'Edit company settings and change their state'),
  ('delivery_notes.create', 'Create delivery notes'),
  ('delivery_notes.delete', 'Permanently delete delivery notes when allowed'),
  ('delivery_notes.read', 'View delivery notes and download existing documents'),
  ('delivery_notes.update', 'Edit delivery notes and change their state'),
  ('estimates.create', 'Create estimates'),
  ('estimates.delete', 'Permanently delete estimates when allowed'),
  ('estimates.read', 'View estimates and download existing documents'),
  ('estimates.update', 'Edit estimates and change their state'),
  ('invoices.create', 'Create invoices'),
  ('invoices.delete', 'Permanently delete invoices when allowed'),
  ('invoices.read', 'View invoices and download existing documents'),
  ('invoices.update', 'Edit invoices and change their state'),
  ('notification_dispatches.read', 'View notification dispatches and download existing documents'),
  ('notification_dispatches.update', 'Edit notification dispatches and change their state'),
  ('notification_rules.read', 'View notification rules and download existing documents'),
  ('notification_rules.update', 'Edit notification rules and change their state'),
  ('payments.create', 'Create payments'),
  ('payments.delete', 'Permanently delete payments when allowed'),
  ('payments.read', 'View payments and download existing documents'),
  ('payments.update', 'Edit payments and change their state'),
  ('products.create', 'Create products'),
  ('products.delete', 'Permanently delete products when allowed'),
  ('products.read', 'View products and download existing documents'),
  ('products.update', 'Edit products and change their state'),
  ('reports.read', 'Access all reports, exports and scheduled reports'),
  ('roles.create', 'Create roles'),
  ('roles.delete', 'Permanently delete roles when allowed'),
  ('roles.read', 'View roles and download existing documents'),
  ('roles.update', 'Edit roles and change their state'),
  ('staff.create', 'Create staff'),
  ('staff.delete', 'Permanently delete unused staff accounts'),
  ('staff.read', 'View staff and download existing documents'),
  ('staff.update', 'Edit staff and change their state'),
  ('templates.create', 'Create templates'),
  ('templates.delete', 'Permanently delete templates when allowed'),
  ('templates.read', 'View templates and download existing documents'),
  ('templates.update', 'Edit templates and change their state')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO roles (key, name, description, is_system) VALUES ('admin', 'Administrator', 'Full global administration', true) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO notification_rules (event_key, enabled, offset_days, repeat_every_days, sender_name, sender_email, locale, subject_template, body_template, body_format, english_subject_template, english_body_template) VALUES
  ('delivery_prepared', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Bon de livraison {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Bonjour {{clientName}},</p><p>Votre bon de livraison {{documentNumber}}, prévu le {{deliveryDate}}, est disponible en pièce jointe.</p><p>Merci pour votre confiance.<br>L’équipe Slama Agricole</p></div>', 'html', 'Slama Agricole — Delivery note {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Your delivery note {{documentNumber}}, scheduled for {{deliveryDate}}, is attached.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'),
  ('estimate_expiry_reminder', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Validité du devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">SLAMA</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">AGRICOLE</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">SUIVI DE DEVIS</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Faisons le point sur votre devis</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous revenons vers vous au sujet de notre proposition. Sa date de validité est rappelée ci-dessous pour vous aider à organiser votre commande.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant de la proposition</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Devis</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Valable jusqu’au</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{validUntil}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Si vous souhaitez donner suite au devis, contactez-nous. Si sa date de validité est dépassée, nous pourrons vérifier les conditions et préparer une nouvelle proposition.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Nous serons ravis de vous accompagner dans la suite de votre projet.</p>
    <p style="margin:0;font-weight:700">L’équipe Slama Agricole</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">Slama Agricole · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'Slama Agricole — Estimate expiry {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Estimate {{documentNumber}} is valid until {{validUntil}}. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'),
  ('estimate_sent', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">SLAMA</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">AGRICOLE</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">VOTRE PROJET</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Votre devis est prêt</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous avons le plaisir de vous transmettre notre proposition. Prenez le temps de consulter le détail des produits et des tarifs.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant du devis</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Référence</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’émission</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{issueDate}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Valable jusqu’au</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{validUntil}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Ce devis est une proposition commerciale, et non une facture. Contactez-nous pour confirmer votre accord ou demander un ajustement.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Nous restons à votre disposition pour vous accompagner dans votre commande.</p>
    <p style="margin:0;font-weight:700">L’équipe Slama Agricole</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">Slama Agricole · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'Slama Agricole — Estimate {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Your estimate {{documentNumber}} is available. Total: {{total}} {{currency}}. Valid until {{validUntil}}.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'),
  ('invoice_due_reminder', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Échéance de la facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">SLAMA</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">AGRICOLE</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">SUIVI DE FACTURE</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Un point sur votre règlement</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous vous adressons ce rappel concernant le solde de votre facture. Vous trouverez son échéance et le montant restant ci-dessous.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Solde restant à régler</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{outstanding}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Facture</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’échéance</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{dueDate}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Si votre règlement vient d’être effectué, contactez-nous afin que nous puissions vérifier sa prise en compte.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">En cas de question sur votre échéance ou votre règlement, votre interlocuteur habituel reste à votre écoute.</p>
    <p style="margin:0;font-weight:700">L’équipe Slama Agricole</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">Slama Agricole · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'Slama Agricole — Invoice reminder {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Invoice {{documentNumber}} is due on {{dueDate}}. Outstanding: {{outstanding}} {{currency}}.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'),
  ('invoice_sent', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">SLAMA</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">AGRICOLE</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">FACTURATION</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Votre facture est disponible</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Merci pour votre confiance. Vous trouverez ci-dessous le récapitulatif de votre facture.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant de la facture</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{total}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Référence</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Date d’émission</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{issueDate}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Le document joint reprend le détail des produits et les conditions de règlement.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Pour toute question concernant cette facture, contactez votre interlocuteur habituel.</p>
    <p style="margin:0;font-weight:700">L’équipe Slama Agricole</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">Slama Agricole · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'Slama Agricole — Invoice {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Your invoice {{documentNumber}} is available. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>'),
  ('payment_received', false, 0, NULL, 'Slama Finance', 'notifications@example.invalid', 'company', 'Slama Agricole — Paiement {{paymentNumber}} reçu', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">SLAMA</p>
    <p style="margin:0;font-size:12px;font-weight:700;color:#4f5661">AGRICOLE</p>
    <div style="padding:24px 0 12px">
      <span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#faf3df;color:#8f6515;font-size:11px;font-weight:700">CONFIRMATION DE PAIEMENT</span>
    </div>
    <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;font-weight:700;color:#20242b">Merci pour votre règlement</h1>
    <p style="margin:0 0 12px">Bonjour <strong>{{clientName}}</strong>,</p>
    <p style="margin:0 0 24px;color:#4f5661">Nous vous confirmons la réception du règlement suivant, enregistré sur votre facture.</p>
    <div style="padding:20px;border-radius:12px;background-color:#faf3df">
      <p style="margin:0 0 4px;font-size:13px;color:#8f6515">Montant reçu</p>
      <p style="margin:0;font-size:30px;line-height:1.3;font-weight:700;color:#8f6515">{{amount}} {{currency}}</p>
    </div>
    <div style="padding:16px 0 20px">
      <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tbody>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Paiement</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{paymentNumber}}</td>
          </tr>
          <tr>
            <th scope="row" style="padding:10px 8px 10px 0;border:0px solid #ffffff;text-align:left;vertical-align:top;font-size:13px;font-weight:400;color:#4f5661">Facture concernée</th>
            <td style="padding:10px 0 10px 8px;border:0px solid #ffffff;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#20242b">{{documentNumber}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="padding:16px;border:1px solid #e4e7ec;border-radius:10px;background-color:#f7f8fa">
      <p style="margin:0;font-size:13px;color:#4f5661">Cette confirmation concerne uniquement le montant indiqué. Elle ne signifie pas nécessairement que la facture est intégralement réglée.</p>
    </div>
    <p style="margin:0;padding:24px 0 16px;color:#4f5661">Merci pour votre confiance et pour votre collaboration.</p>
    <p style="margin:0;font-weight:700">L’équipe Slama Agricole</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">Slama Agricole · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', 'Slama Agricole — Payment {{paymentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">SLAMA AGRICOLE</h2><p>Hello {{clientName}},</p><p>Your payment {{paymentNumber}} of {{amount}} {{currency}} has been recorded for invoice {{documentNumber}}.</p><p>Thank you for your trust.<br>The Slama Agricole team</p></div>')
ON CONFLICT (event_key) DO NOTHING;
