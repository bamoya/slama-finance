import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  FileText,
  MoreHorizontal,
  ReceiptText,
} from 'lucide-react'

import { useMarketing } from '../hooks/marketing-context'
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
