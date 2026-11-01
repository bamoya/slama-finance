import { AnimStage } from './AnimStage'

// Approved animation "reminder + payment" (variant A), markup copied from design/animations-reference.html.
const HTML = `
        <div class="night"></div>
        <div class="owner"><span class="avatar a-biz">A</span>Vous · Atlas Négoce SARL</div>
        <div class="cal"><div class="top">Échéance</div><div class="paidtop">Encaissé</div><div class="day">21</div><div class="lab">septembre 2026</div><span class="pill late">J+12</span><span class="pill ok okpill">✓ Payée · 39 228,00 MAD</span></div>
        <div class="client"><span class="avatar a-cli">F</span><b>Ferme Oulad Saïd</b><span class="pill ok paidmark" style="font-size:calc(.85 * var(--u));padding:calc(.25 * var(--u)) calc(.7 * var(--u))">Virement effectué</span></div>
        <div class="zz" aria-hidden="true">z z</div>
        <div class="cap light q">Vos clients oublient de payer ?</div><div class="cap a">Les relances partent toutes seules.</div>
        <div class="env">✉ Rappel automatique</div><div class="bell" aria-hidden="true">🔔</div>
        <div class="money">← 39 228,00 MAD</div>
      `

export const Reminder = () => <AnimStage cls="A rem" html={HTML} />
