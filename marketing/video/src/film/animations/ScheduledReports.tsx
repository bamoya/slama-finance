import { AnimStage } from './AnimStage'

// Approved animation "scheduled reports" (variant A), markup copied from design/animations-reference.html.
const HTML = `
        <div class="cap">Suivez tout, sans y penser.</div><div class="cap sub">Votre rapport arrive chaque mois, tout seul.</div>
        <div class="app"><div class="chrome"><i></i><i></i><i></i><span>atlas-negoce.bfinance.ma</span></div><div class="body"><div class="side"><div class="brand"><em>B</em>Finance</div><div class="org"><b>AN</b>Atlas Négoce SARL</div>
<div class="grp">Ventes</div><div class="nav">Devis</div><div class="nav">Factures</div><div class="nav">Paiements</div>
<div class="grp">Rapports</div><div class="nav">Rapports</div><div class="nav on">Rapports planifiés</div>
<div class="grp">Paramètres</div><div class="nav ">Personnel</div><div class="nav ">Modèles de documents</div></div>
          <div class="main"><div class="ph"><div><small>B-Finance / Rapports</small><b>Rapports planifiés</b></div><span class="btn">+ Nouvelle planification</span></div>
            <div class="card"><table><thead><tr><th>Nom</th><th>Fréquence</th><th>Destinataires</th><th>Prochain envoi</th><th>Statut</th><th></th></tr></thead>
              <tbody><tr><td><b>Rapport mensuel de gestion</b></td><td>Mensuel · le 1er</td><td>karim@atlas-negoce.ma</td><td>01-12-2026</td><td><span class="badge ok">Actif</span></td><td><span class="btn ghost" data-t="btn">Envoyer un test</span></td></tr>
              <tr><td>Synthèse des encaissements</td><td>Hebdomadaire · lundi</td><td>salma@cabinet-idrissi.ma</td><td>02-11-2026</td><td><span class="badge ok">Actif</span></td><td></td></tr></tbody></table></div>
            <div class="toast"><span class="ic">✓</span>Rapport envoyé à karim@atlas-negoce.ma</div></div></div></div>
        <div class="ptr "><span class="ring"></span><svg viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M4 2l15 11-6.5 1.2L9 21z" fill="#252a32" stroke="#fff" stroke-width="1.5"/></svg></div>
        <div class="mail"><div class="mh"><b>Atlas Négoce SARL — Rapport mensuel de gestion</b><span>À : karim@atlas-negoce.ma · 01-11-2026 08:00</span></div>
          <div class="mb"><div class="gl"></div><div class="ti">Octobre 2026</div>
            <div class="bars"><i style="--h:42%"></i><i style="--h:58%"></i><i style="--h:50%"></i><i style="--h:71%"></i><i style="--h:64%"></i><i style="--h:88%"></i></div>
            <div class="k"><span>Facturé<b>477 600,00</b></span><span>Encaissé<b>392 460,00</b></span><span>En retard<b>55 476,00</b></span></div>
            <span class="badge gold" style="justify-self:start">PDF + Excel joints</span></div></div>
      `

export const ScheduledReports = () => <AnimStage cls="R" html={HTML} />
