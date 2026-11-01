import { AnimStage } from './AnimStage'

// Approved animation "staff invitation and limited access" (variant A), markup copied from design/animations-reference.html.
const HTML = `
        <div class="cap">Chacun ses droits.</div><div class="cap sub">Invitez votre comptable : elle voit ce qu'il faut, rien de plus.</div>
        <div class="app ownerapp"><div class="chrome"><i></i><i></i><i></i><span>atlas-negoce.bfinance.ma</span></div><div class="body"><div class="side"><div class="brand"><em>B</em>Finance</div><div class="org"><b>AN</b>Atlas Négoce SARL</div>
<div class="grp">Ventes</div><div class="nav">Devis</div><div class="nav">Factures</div><div class="nav">Paiements</div>
<div class="grp">Rapports</div><div class="nav">Rapports</div><div class="nav ">Rapports planifiés</div>
<div class="grp">Paramètres</div><div class="nav on">Personnel</div><div class="nav ">Modèles de documents</div></div>
          <div class="main"><div class="ph"><div><small>B-Finance / Identité</small><b>Personnel</b></div><span class="btn">+ Inviter un membre</span></div>
            <div class="card"><table><thead><tr><th>Membre</th><th>Rôle</th><th>Statut</th></tr></thead>
              <tbody><tr><td><b>Karim Benali</b></td><td>Administrateur</td><td><span class="badge ok">Actif</span></td></tr>
              <tr><td>Nadia Chraibi</td><td>Commercial</td><td><span class="badge ok">Actif</span></td></tr></tbody></table></div>
            <div class="toast"><span class="ic">✉</span>Invitation envoyée à Salma Idrissi</div></div></div></div>
        <div class="app staffapp"><div class="chrome"><i></i><i></i><i></i><span>atlas-negoce.bfinance.ma</span></div><div class="body"><div class="side"><div class="brand"><em>B</em>Finance</div><div class="org"><b>AN</b>Atlas Négoce SARL</div>
<div class="grp">Ventes</div><div class="nav lock">Devis</div><div class="nav on">Factures</div><div class="nav">Paiements</div>
<div class="grp">Rapports</div><div class="nav">Rapports</div>
<div class="grp">Paramètres</div><div class="nav lock">Clients</div><div class="nav lock">Personnel</div><div class="nav lock set" data-t="lock">Paramètres</div></div>
          <div class="main"><div class="ph"><div><small>Connectée : Salma Idrissi · Comptable</small><b>Factures</b></div></div>
            <div class="card"><table><thead><tr><th>Facture</th><th>Client</th><th>Total</th><th>Statut</th></tr></thead>
              <tbody><tr><td>FAC-2026-…2535</td><td>Coopérative Al Baraka</td><td>9 240,00 MAD</td><td><span class="badge gold">Émise</span></td></tr>
              <tr><td>FAC-2026-…1000</td><td>Ferme Oulad Saïd</td><td>39 228,00 MAD</td><td><span class="badge ok">Payée</span></td></tr></tbody></table></div>
            <div class="deny">🔒 Paramètres : accès réservé aux administrateurs</div></div></div></div>
        <div class="scrim"></div>
        <div class="dialog"><b>Inviter un membre</b><div class="inp">salma.idrissi@cabinet-idrissi.ma</div><div class="inp">Comptable <small>Rôle</small></div>
          <div class="perm"><span>Factures, paiements</span><span class="yes">Accès</span><span>Rapports</span><span class="yes">Accès</span><span>Clients, personnel</span><span class="no">Aucun</span><span>Paramètres</span><span class="no">Aucun</span></div>
          <div class="row2"><span class="btn ghost">Annuler</span><span class="btn" data-t="send">Envoyer l'invitation</span></div></div>
        <div class="ptr p1"><span class="ring"></span><svg viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M4 2l15 11-6.5 1.2L9 21z" fill="#252a32" stroke="#fff" stroke-width="1.5"/></svg></div><div class="ptr p2"><span class="ring"></span><svg viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M4 2l15 11-6.5 1.2L9 21z" fill="#252a32" stroke="#fff" stroke-width="1.5"/></svg></div>
      `

export const StaffAccess = () => <AnimStage cls="S" html={HTML} />
