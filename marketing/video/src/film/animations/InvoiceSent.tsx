import { AnimStage } from './AnimStage'

// Approved animation "invoice sent" (variant A), markup copied from design/animations-reference.html.
const HTML = `
        <div class="cap">Facturez et envoyez en un clic.</div><div class="cap sub">Votre client la reçoit aussitôt, avec le PDF.</div>
        <div class="doc"><b>Facture</b><div class="ln" style="width:70%"></div><div class="ln" style="width:55%"></div><div class="ln"></div><div class="ln" style="width:80%"></div><div class="tot"><span>Total TTC</span><span>9 240,00 MAD</span></div></div>
        <svg class="trail" viewBox="0 0 400 200" fill="none" aria-hidden="true"><path d="M5 150 C 120 10, 260 10, 395 120" stroke="#946f29" stroke-width="3" stroke-dasharray="6 9" stroke-linecap="round"/></svg>
        <div class="plane" aria-hidden="true"><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M2 11.5 22 3l-6.5 18-3.8-7.2L2 11.5Z" fill="#946f29"/></svg></div>
        <span class="sent pill ok">✓ Envoyée</span>
        <div class="inbox"><div class="bar"><span>Boîte de réception</span><span style="color:#687280;font-weight:500">contact@coop-albaraka.ma</span></div>
          <div class="row new"><span class="avatar a-biz" style="width:calc(2.8 * var(--u));font-size:calc(1.1 * var(--u))">A</span><div><b>Atlas Négoce SARL</b><span>Facture FAC-2026 · 9 240,00 MAD · PDF joint</span></div></div>
          <div class="row"><span class="avatar" style="width:calc(2.8 * var(--u));background:#d6d9df"></span><div style="flex:1"><div class="ph"></div><div class="ph" style="width:45%"></div></div></div>
          <div class="row"><span class="avatar" style="width:calc(2.8 * var(--u));background:#d6d9df"></span><div style="flex:1"><div class="ph" style="width:60%"></div><div class="ph" style="width:35%"></div></div></div>
        </div>
      `

export const InvoiceSent = () => <AnimStage cls="A inv" html={HTML} />
