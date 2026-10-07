import { ArrowLeft, FileDown, PackageCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import { FormActionBar } from '../../../components/management/form-action-bar'
import { MoreAction, MoreActions } from '../../../components/management/more-actions'
import { PageHeader } from '../../../components/management/page-header'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Combobox } from '../../../components/ui/combobox'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { clients } from '../../clients'
import { invoices } from '../../documents'
import { products } from '../../products'

type DeliveryLine = { id: number; product: string; quantity: number; unit: string }

export function DeliveryNoteEditorPage({ readOnly = false }: { readOnly?: boolean }) {
  useUiLanguage()

  const { noteId } = useParams<{ noteId?: string }>()
  const [, navigate] = useLocation()
  const editing = Boolean(noteId)
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [invoiceId, setInvoiceId] = useState('')
  const [lines, setLines] = useState<DeliveryLine[]>([
    { id: 1, product: 'Premium wheat · 100 g', quantity: 12, unit: '100 g package' },
    { id: 2, product: 'Premium wheat · 500 g', quantity: 4, unit: '500 g package' },
  ])
  const updateProduct = (id: number, value: string) => {
    const found = products.find((product) => product.id === value)
    if (!found) return
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, product: found.name, unit: found.unit } : line,
      ),
    )
  }
  return (
    <div className="mx-auto max-w-[1500px] p-page">
      <Link
        href="/delivery-notes"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={17} />
        {translate('Back to delivery notes')}
      </Link>
      <form
        id="delivery-note-editor-page"
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          navigate('/delivery-notes')
        }}
      >
        <PageHeader
          eyebrow={translate('Sales / Delivery notes')}
          title={
            readOnly
              ? 'BL-0018'
              : editing
                ? translate('Edit BL-0018')
                : translate('Create delivery note')
          }
          description={translate(
            'Confirm which products and quantities were handed over without displaying prices.',
          )}
          actions={
            readOnly ? (
              <>
                <MoreActions>
                  <MoreAction
                    label={translate('Download PDF')}
                    icon={<FileDown size={17} />}
                    disabled
                  />
                </MoreActions>
                <Link href={`/delivery-notes/${noteId}/edit`} className={buttonVariants({})}>
                  <Pencil size={16} aria-hidden="true" />
                  {translate('Edit')}
                </Link>
              </>
            ) : undefined
          }
        />
        <section className="grid gap-section rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-surface md:p-panel">
          <div className="grid gap-content md:grid-cols-2 lg:grid-cols-4">
            <Field label={translate('Delivery note number')}>
              <Input defaultValue={editing ? 'BL-0018' : 'BL-0021'} disabled={readOnly} />
            </Field>
            <Field label={translate('Delivery date')}>
              <Input type="date" defaultValue="2026-09-22" disabled={readOnly} />
            </Field>
            <Field label={translate('Client')}>
              <Combobox
                disabled={readOnly}
                value={clientId}
                onValueChange={setClientId}
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                  keywords: [client.ice, client.city],
                }))}
                placeholder={translate('Select client')}
                aria-label={translate('Client')}
              />
            </Field>
            <Field label={translate('Related invoice (optional)')}>
              <Combobox
                disabled={readOnly}
                value={invoiceId}
                onValueChange={setInvoiceId}
                options={invoices.map((invoice) => ({
                  value: invoice.id,
                  label: `${invoice.number} · ${invoice.client}`,
                  keywords: [invoice.client, invoice.number],
                }))}
                placeholder={translate('No related invoice')}
                clearLabel={translate('No related invoice')}
                aria-label={translate('Related invoice')}
              />
            </Field>
          </div>
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)]">
            <div className="grid grid-cols-[1fr_130px_140px] gap-3 bg-[#17191d] px-4 py-3 text-xs font-semibold text-white">
              <span>{translate('Product')}</span>
              <span>{translate('Quantity')}</span>
              <span>{translate('Unit')}</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid min-w-[600px] grid-cols-[1fr_130px_140px] items-center gap-3 p-3"
                >
                  <div>
                    <Combobox
                      disabled={readOnly}
                      value={
                        products.find((product) => product.name === line.product)?.id ??
                        line.product
                      }
                      selectedLabel={line.product}
                      onValueChange={(value) => updateProduct(line.id, value)}
                      options={products.map((product) => ({
                        value: product.id,
                        label: product.name,
                        keywords: [product.reference],
                      }))}
                      placeholder={translate('Search product')}
                      aria-label={translate('Product')}
                    />
                  </div>
                  <Input
                    disabled={readOnly}
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? { ...item, quantity: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{line.unit}</span>
                    {!readOnly && (
                      <Button
                        variant="destructive"
                        aria-label={translate('Remove line item')}
                        type="button"
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.id !== line.id))
                        }
                        size="icon"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <Button
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { id: Date.now(), product: '', quantity: 1, unit: 'Unit' },
                  ])
                }
                variant="outline"
                className="w-full"
              >
                <Plus size={16} />
                {translate('Add product')}
              </Button>
            )}
          </div>
          <div className="grid gap-content md:grid-cols-2">
            <Field label={translate('Delivery address')}>
              <Textarea
                disabled={readOnly}
                rows={4}
                defaultValue="Atlas Studio, 18 Boulevard Zerktouni, Casablanca"
              />
            </Field>
            <Field label={translate('Delivery instructions')}>
              <Textarea
                disabled={readOnly}
                rows={4}
                placeholder={translate('Contact person, access details or observations')}
              />
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-[16px] bg-[var(--surface-muted)] p-4 text-sm font-medium">
            <input
              type="checkbox"
              defaultChecked
              disabled={readOnly}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {translate('Include signature and reception confirmation on the PDF')}
          </label>
        </section>
        {!readOnly && (
          <FormActionBar>
            <Link href="/delivery-notes" className={buttonVariants({ variant: 'outline' })}>
              {translate('Cancel')}
            </Link>
            <Button type="submit" form="delivery-note-editor-page">
              <PackageCheck size={17} />
              {translate('Save delivery note')}
            </Button>
          </FormActionBar>
        )}
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  useUiLanguage()

  return (
    <label className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </label>
  )
}
