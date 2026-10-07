import '../translations'

import { ChevronRight, FileText, Receipt, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { Button } from '../../../components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible'
import { useUiLanguage } from '../../../lib/i18n'
import { cn } from '../../../lib/utils'
import { useClientActivity } from '../../sales'
import {
  type ActivityFilters,
  type ActivityNode,
  buildActivityTree,
  filterActivityTree,
} from './activity-tree-model'

const icons = { estimate: FileText, invoice: Receipt, delivery_note: Truck, payment: Wallet }

function ActivityBranch({ node, filtered }: { node: ActivityNode; filtered: boolean }) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const [open, setOpen] = useState(filtered)
  const Icon = icons[node.kind]
  return (
    <li className="min-w-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-start gap-2 rounded-xl p-3 hover:bg-[var(--surface-hover)]">
          {node.children.length ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(open ? 'collapseRecord' : 'expandRecord', {
                  number: node.number ?? t('draft'),
                })}
              >
                <ChevronRight
                  className={cn(
                    'transition-transform motion-reduce:transition-none',
                    open && 'rotate-90',
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="size-9 shrink-0" />
          )}
          <Icon className="mt-2 size-5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <Link
                href={node.href}
                className="break-all text-sm font-semibold hover:text-[var(--accent)]"
              >
                {node.number ?? t('draft')}
              </Link>
              <p className="text-xs text-[var(--muted)]">
                {t(node.kind)} · {node.date}
                {node.method && ` · ${t(`methods.${node.method}`)}`}
              </p>
              {node.reference && (
                <p className="text-xs text-[var(--muted)]">{t('sharedDelivery')}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={t(`statuses.${node.status}`)}
                tone={
                  ['cancelled', 'superseded'].includes(node.status)
                    ? 'archived'
                    : ['draft', 'pending'].includes(node.status)
                      ? 'draft'
                      : 'active'
                }
              />
              {node.paymentStatus && (
                <StatusBadge
                  label={t(`settlement.${node.paymentStatus}`)}
                  tone={node.paymentStatus === 'paid' ? 'active' : 'draft'}
                />
              )}
              <div className="text-right text-sm tabular-nums">
                {node.amount && <p className="font-semibold">{node.amount}</p>}
                {node.outstanding && (
                  <p className="text-xs text-[var(--muted)]">
                    {t('outstanding')}: {node.outstanding}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        {!!node.children.length && (
          <CollapsibleContent>
            <ul className="ml-4 border-l border-border pl-1 sm:ml-7 sm:pl-3">
              {node.children.map((child) => (
                <ActivityBranch
                  key={`${child.kind}:${child.id}`}
                  node={child}
                  filtered={filtered}
                />
              ))}
            </ul>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  )
}

export function ClientActivityTree({
  clientId,
  filters,
}: {
  clientId: string
  filters: ActivityFilters
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const query = useClientActivity(clientId)
  if (query.isPending || query.isError)
    return (
      <div className="p-5">
        <RequestState query={query} />
      </div>
    )
  const { estimates, invoices, deliveries, payments } = query.data
  const nodes = filterActivityTree(
    buildActivityTree(estimates, invoices, deliveries, payments),
    filters,
  )
  const filtered = Object.values(filters).some(Boolean)
  return (
    <div className="p-3 sm:p-5">
      <p className="mb-3 text-xs text-[var(--muted)]">{t('treeHint')}</p>
      {!nodes.length ? (
        <p className="p-3 text-sm text-[var(--muted)]">{t('noRecords')}</p>
      ) : (
        <ul
          key={JSON.stringify(filters)}
          aria-label={t('activityTree')}
          className="flex flex-col gap-1"
        >
          {nodes.map((node) => (
            <ActivityBranch key={`${node.kind}:${node.id}`} node={node} filtered={filtered} />
          ))}
        </ul>
      )}
    </div>
  )
}
