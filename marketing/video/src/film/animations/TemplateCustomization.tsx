import { AnimStage } from './AnimStage'

// Approved animation "template customization" (variant A), markup copied from design/animations-reference.html.
const HTML = `
        <div class="cap">Des factures à votre image.</div><div class="cap sub">Couleur, mise en page et logo, avec l'aperçu immédiat.</div>
        <div class="app"><div class="chrome"><i></i><i></i><i></i><span>atlas-negoce.bfinance.ma</span></div><div class="body"><div class="side"><div class="brand"><em>B</em>Finance</div><div class="org"><b>AN</b>Atlas Négoce SARL</div>
<div class="grp">Ventes</div><div class="nav">Devis</div><div class="nav">Factures</div><div class="nav">Paiements</div>
<div class="grp">Rapports</div><div class="nav">Rapports</div><div class="nav ">Rapports planifiés</div>
<div class="grp">Paramètres</div><div class="nav ">Personnel</div><div class="nav on">Modèles de documents</div></div>
          <div class="main"><div class="ph"><div><small>B-Finance / Paramètres</small><b>Créer un modèle</b></div><span class="btn">Enregistrer les modifications</span></div>
            <div class="cols"><div class="opts">
              <div class="lbl">Mise en page</div><div class="lays"><div class="lay sel l1"><i></i>Classique</div><div class="lay l2" data-t="lay"><i></i>Moderne</div><div class="lay"><i></i>Compact</div></div>
              <div class="lbl">Couleur d'accent</div><div class="sw"><i style="background:#946f29"></i><i style="background:#2f6f5e" data-t="sw2"></i><i style="background:#2d5a9e" data-t="sw3"></i><i style="background:#8b3a3a"></i></div>
              <div class="lbl">Logo</div><div class="inp">logo-atlas.png <small>Importer</small></div></div>
              <div class="prev"><div class="t"><span class="badge gold">Facture</span><span class="badge grey">Devis</span><span class="badge grey">Reçu</span></div>
                <div class="paper"><div class="hd"><div class="lg" data-t="logo">A</div><b>Facture</b></div><div class="l" style="width:60%"></div><div class="l" style="width:42%"></div><div class="l"></div><div class="l"></div><div class="l" style="width:75%"></div><div class="tt"><span>Total TTC</span><span>9 240,00 MAD</span></div></div></div></div>
          </div></div></div>
        <div class="ptr "><span class="ring"></span><svg viewBox="0 0 24 24" width="100%" aria-hidden="true"><path d="M4 2l15 11-6.5 1.2L9 21z" fill="#252a32" stroke="#fff" stroke-width="1.5"/></svg></div>
      `

export const TemplateCustomization = () => <AnimStage cls="T" html={HTML} />
