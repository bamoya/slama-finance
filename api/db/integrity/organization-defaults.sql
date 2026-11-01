CREATE FUNCTION provision_organization_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_scope text;
BEGIN
  previous_scope := current_setting('app.organization_id',true);
  PERFORM set_config('app.organization_id',NEW.id::text,true);
  INSERT INTO owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at) VALUES(NEW.owner_id,'trial',NEW.created_at,NEW.created_at+interval '7 days') ON CONFLICT DO NOTHING;

INSERT INTO roles (key, name, description, is_system) VALUES ('admin', 'Administrator', 'Full organization administration', true) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin' AND r.organization_id = nullif(current_setting('app.organization_id',true),'')::uuid ON CONFLICT DO NOTHING;

INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO notification_rules (event_key, enabled, offset_days, repeat_every_days, sender_name, sender_email, locale, subject_template, body_template, body_format, english_subject_template, english_body_template) VALUES
  ('delivery_prepared', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Bon de livraison {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Bonjour {{clientName}},</p><p>Votre bon de livraison {{documentNumber}}, prévu le {{deliveryDate}}, est disponible en pièce jointe.</p><p>Merci pour votre confiance.<br>L’équipe {{organizationName}}</p></div>', 'html', '{{organizationName}} — Delivery note {{documentNumber}}', '<div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e4e7ec;border-radius:16px"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Your delivery note {{documentNumber}}, scheduled for {{deliveryDate}}, is attached.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>'),
  ('estimate_expiry_reminder', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Validité du devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">{{organizationName}}</p>
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
    <p style="margin:0;font-weight:700">L’équipe {{organizationName}}</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">{{organizationName}} · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', '{{organizationName}} — Estimate expiry {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Estimate {{documentNumber}} is valid until {{validUntil}}. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>'),
  ('estimate_sent', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Devis {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">{{organizationName}}</p>
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
    <p style="margin:0;font-weight:700">L’équipe {{organizationName}}</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">{{organizationName}} · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', '{{organizationName}} — Estimate {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Your estimate {{documentNumber}} is available. Total: {{total}} {{currency}}. Valid until {{validUntil}}.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>'),
  ('invoice_due_reminder', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Échéance de la facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">{{organizationName}}</p>
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
    <p style="margin:0;font-weight:700">L’équipe {{organizationName}}</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">{{organizationName}} · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', '{{organizationName}} — Invoice reminder {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Invoice {{documentNumber}} is due on {{dueDate}}. Outstanding: {{outstanding}} {{currency}}.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>'),
  ('invoice_sent', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Facture {{documentNumber}}', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">{{organizationName}}</p>
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
    <p style="margin:0;font-weight:700">L’équipe {{organizationName}}</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">{{organizationName}} · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', '{{organizationName}} — Invoice {{documentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Your invoice {{documentNumber}} is available. Total: {{total}} {{currency}}.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>'),
  ('payment_received', false, 0, NULL, 'B-Finance', 'notifications@example.invalid', 'company', '{{organizationName}} — Paiement {{paymentNumber}} reçu', '<div lang="fr" dir="ltr" style="max-width:600px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#20242b;background-color:#ffffff;border:1px solid #e4e7ec;border-radius:16px">
  <div style="height:5px;background-color:#ad7d1d;border-radius:16px"></div>
  <div style="padding:24px">
    <p style="margin:0;font-size:26px;font-weight:700;color:#8f6515">{{organizationName}}</p>
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
    <p style="margin:0;font-weight:700">L’équipe {{organizationName}}</p>
  </div>
  <div style="padding:16px 24px;background-color:#f7f8fa;border-radius:12px">
    <p style="margin:0;font-size:12px;color:#4f5661">{{organizationName}} · Suivi de votre relation commerciale</p>
    <p style="margin:4px 0 0;font-size:11px;color:#4f5661">Message automatique. Pour toute demande, contactez votre interlocuteur habituel.</p>
  </div>
</div>', 'html', '{{organizationName}} — Payment {{paymentNumber}}', '<div lang="en" style="max-width:600px;padding:24px;border:1px solid #e4e7ec;border-radius:16px;font-family:Arial,sans-serif"><h2 style="color:#8f6515">{{organizationName}}</h2><p>Hello {{clientName}},</p><p>Your payment {{paymentNumber}} of {{amount}} {{currency}} has been recorded for invoice {{documentNumber}}.</p><p>Thank you for your trust.<br>The {{organizationName}} team</p></div>')
ON CONFLICT DO NOTHING;

  PERFORM set_config('app.organization_id',coalesce(previous_scope,''),true);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organization_defaults_after_create AFTER INSERT ON organizations
FOR EACH ROW EXECUTE FUNCTION provision_organization_defaults();
