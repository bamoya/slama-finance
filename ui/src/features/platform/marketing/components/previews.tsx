import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  FileText,
  Maximize2,
  MoreHorizontal,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'

import { useMarketing } from '../hooks/marketing-context'
import { Dialog } from './ui'
export function DashboardPreview({ compact = false }: { compact?: boolean }) {
  const { t, locale, dark } = useMarketing()
  const [zoom, setZoom] = useState(false)
  const src = `/marketing/dashboard-${locale}-${dark ? 'dark' : 'light'}.png`
  return (
    <>
      <figure className={`dashboard-preview ${compact ? 'compact-preview' : ''}`}>
        <div className="preview-chrome">
          <span className="window-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>
            <span className="chrome-dot" /> app.bamoya.finance / {t('overview')}
          </span>
          <span className="chrome-demo">{t('Preview')}</span>
        </div>
        <button
          className="preview-image-button"
          aria-label={t('Enlarge the dashboard preview')}
          onClick={() => setZoom(true)}
        >
          <img
            width="1440"
            height="1020"
            src={src}
            alt={t(
              'Owner portal: four financial indicators, invoicing and collection trends, organization contributions. Fictional data in MAD.',
            )}
          />
          <span className="zoom-label">
            <Maximize2 size={13} />
            {t('Enlarge')}
          </span>
        </button>
        <figcaption>{t('Classic portal preview · demonstration data in MAD')}</figcaption>
      </figure>
      <Dialog
        className="preview-dialog"
        open={zoom}
        onClose={() => setZoom(false)}
        title={t('A clear view of your business')}
        description={t('Static portal preview · fictional data')}
      >
        <img src={src} alt={t('Enlarged dashboard')} />
      </Dialog>
    </>
  )
}
export function DocumentPreview() {
  const { t } = useMarketing()
  return (
    <div
      className="product-illustration document-illustration"
      role="img"
      aria-label={t(
        'Illustration: an Atelier Atlas invoice for MAD 2,400, with MAD 900 collected and MAD 1,500 outstanding.',
      )}
    >
      <div className="illustration-toolbar">
        <span>
          <FileText size={15} />
          {t('Your documents, your identity')}
        </span>
        <span className="mini-badge">{t('Illustration')}</span>
      </div>
      <div className="paper">
        <div className="paper-header">
          <span className="company-emblem">
            A
            <span>
              Atelier Atlas<small>CASABLANCA · MAROC</small>
            </span>
          </span>
          <span className="paper-type">
            {t('INVOICE')}
            <small>FAC-2026-482715</small>
          </span>
        </div>
        <div className="paper-parties">
          <div>
            <small>{t('BILL TO')}</small>
            <strong>Maison Safran</strong>
            <span>Rabat, Maroc</span>
          </div>
          <div>
            <small>{t('ISSUED')}</small>
            <strong>29-10-2026</strong>
            <span>{t('Due: 28-11-2026')}</span>
          </div>
        </div>
        <div className="paper-table">
          <div>
            <span>{t('Product')}</span>
            <span>{t('Qty')}</span>
            <span>MAD</span>
          </div>
          <div>
            <strong>{t('Discovery box · 500 g')}</strong>
            <span>20</span>
            <span>1 600</span>
          </div>
          <div>
            <strong>{t('Premium selection · 200 g')}</strong>
            <span>10</span>
            <span>800</span>
          </div>
        </div>
        <div className="paper-total">
          <span>Total MAD</span>
          <strong>2 400,00</strong>
        </div>
        <div className="paper-footer">
          {t('Thank you for your business.')}
          <span>Atelier Atlas</span>
        </div>
      </div>
      <div className="payment-stamp">
        <span className="success-circle">
          <CheckCheck size={18} />
        </span>
        <div>
          <strong>{t('Deposit recorded')}</strong>
          <span>900 MAD · {t('Bank transfer')}</span>
        </div>
        <span className="stamp-balance">
          {t('Balance')}
          <b>1 500 MAD</b>
        </span>
      </div>
    </div>
  )
}
export function ClientPreview() {
  const { t } = useMarketing()
  return (
    <div className="product-illustration client-illustration">
      <div className="illustration-toolbar">
        <span>
          <Building2 size={15} />
          {t('One relationship, the full story')}
        </span>
        <MoreHorizontal size={17} />
      </div>
      <div className="client-head">
        <span className="client-avatar">MS</span>
        <div>
          <h3>Maison Safran</h3>
          <p>Rabat · {t('Business client')}</p>
        </div>
        <span className="mini-badge success">{t('Active')}</span>
      </div>
      <div className="client-metrics">
        <div>
          <span>{t('Invoiced')}</span>
          <strong>
            18 600 <small>MAD</small>
          </strong>
        </div>
        <div>
          <span>{t('Outstanding')}</span>
          <strong>
            4 200 <small>MAD</small>
          </strong>
        </div>
      </div>
      <div className="record-tree">
        <div>
          <span className="tree-icon">
            <FileText size={16} />
          </span>
          <span>
            <strong>DEV-2026-391042</strong>
            <small>{t('Accepted estimate')}</small>
          </span>
          <span className="mini-badge">6 000 MAD</span>
        </div>
        <div className="tree-child">
          <span className="tree-icon">
            <ReceiptText size={16} />
          </span>
          <span>
            <strong>FAC-2026-482715</strong>
            <small>{t('Partially paid')}</small>
          </span>
          <span>2 400 MAD</span>
        </div>
        <div className="tree-child deeper">
          <span className="tree-icon paid">
            <ArrowDownLeft size={16} />
          </span>
          <span>
            <strong>{t('Bank transfer')}</strong>
            <small>29-10-2026</small>
          </span>
          <span className="success-text">900 MAD</span>
        </div>
        <div className="tree-child">
          <span className="tree-icon">
            <Check size={16} />
          </span>
          <span>
            <strong>BL-2026-650231</strong>
            <small>{t('Delivered')}</small>
          </span>
          <Check size={16} className="success-text" />
        </div>
      </div>
      <div className="illustration-caption">
        {t('Product illustration · fictional data')}
        <ArrowUpRight size={14} />
      </div>
    </div>
  )
}
export function CollectionPreview() {
  const { t } = useMarketing()
  return (
    <div className="product-illustration collection-illustration">
      <div className="illustration-toolbar">
        <span>
          <Wallet size={16} />
          {t('Every payment accounted for')}
        </span>
        <span className="mini-badge">MAD</span>
      </div>
      <div className="collection-main">
        <span>{t('Invoice · Maison Safran')}</span>
        <strong>
          6 000<small>,00 MAD</small>
        </strong>
        <div className="collection-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="collection-key">
          <span>
            <i />
            {t('Collected')} <b>4 200 MAD</b>
          </span>
          <span>
            <i />
            {t('Outstanding')} <b>1 800 MAD</b>
          </span>
        </div>
      </div>
      {[
        [t('Bank transfer'), '24-10-2026', '3 000'],
        [t('Cash'), '28-10-2026', '1 200'],
      ].map(([method, date, sum]) => (
        <div className="payment-line" key={method}>
          <span className="tree-icon paid">
            <ArrowDownLeft size={17} />
          </span>
          <span>
            <strong>{method}</strong>
            <small>{date}</small>
          </span>
          <b>+ {sum} MAD</b>
          <Check size={15} />
        </div>
      ))}
      <div className="illustration-caption">
        {t('Deposits, due dates and receipts in one place.')}
        <ReceiptText size={16} />
      </div>
    </div>
  )
}
