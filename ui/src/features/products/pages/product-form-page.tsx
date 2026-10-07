import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import {
  type Product,
  type ProductInput,
  ProductInputSchema,
  ProductUpdateSchema,
  type VariantInput,
} from '../../../api/generated/schemas/catalog/catalog.schemas'
import { FormActionBar } from '../../../components/management/form-action-bar'
import { FormError } from '../../../components/management/form-error'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Combobox } from '../../../components/ui/combobox'
import { Input } from '../../../components/ui/input'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'
import { validationMessage } from '../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { MediaUploadField } from '../../media'
import { refreshCatalog, useCatalogActions, useCategories, useProduct } from '../queries'

const blank: ProductInput = {
  reference: '',
  name: '',
  description: null,
  categoryId: null,
  imageAssetId: null,
  suggestedVatRate: null,
  variants: [{ weightG: 100, pricePerItem: '', costPerItem: null, active: true }],
}
const variantFrom = (value: Product['variants'][number]): VariantInput => ({
  id: value.id,
  weightG: value.weightG,
  pricePerItem: value.pricePerItem,
  costPerItem: value.costPerItem,
  active: !value.archivedAt,
})
const fromProduct = (product: Product): ProductInput => ({
  reference: product.reference,
  name: product.name,
  description: product.description,
  categoryId: product.categoryId,
  imageAssetId: product.imageAssetId,
  suggestedVatRate: product.suggestedVatRate,
  variants: product.variants.map(variantFrom),
})

export function ProductFormPage() {
  useUiLanguage()

  const { productId } = useParams<{ productId?: string }>()
  const query = useProduct(productId ?? '', !!productId)
  const [snapshot, setSnapshot] = useState<Product | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (query.data && (!snapshot || snapshot.id !== query.data.id)) setSnapshot(query.data)
  }, [query.data, snapshot])
  if (productId && (query.isPending || query.isError || !snapshot || snapshot.id !== productId))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  return (
    <ProductEditor
      key={`${productId ?? 'new'}-${revision}`}
      product={productId ? snapshot : null}
      onReload={
        productId
          ? async () => {
              const result = await query.refetch()
              if (result.data) {
                setSnapshot(result.data)
                setRevision((current) => current + 1)
              }
            }
          : undefined
      }
    />
  )
}

function ProductEditor({
  product,
  onReload,
}: {
  product: Product | null
  onReload?: () => Promise<void>
}) {
  useUiLanguage()

  const [, navigate] = useLocation()
  const categories = useCategories({ status: 'all' })
  const cache = useQueryClient()
  const actions = useCatalogActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const form = useForm({
    defaultValues: product ? fromProduct(product) : blank,
    onSubmit: async ({ value }) => {
      if (uploading) return
      setError(undefined)
      const parsed = product
        ? ProductUpdateSchema.safeParse({ ...value, expectedVersion: product.version })
        : ProductInputSchema.safeParse(value)
      if (!parsed.success) {
        setIssues(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${validationMessage(issue.message)}`,
          ),
        )
        return
      }
      setIssues([])
      try {
        const result = product
          ? await actions.updateProduct(
              product.id,
              ProductUpdateSchema.parse({ ...value, expectedVersion: product.version }),
            )
          : await actions.createProduct(ProductInputSchema.parse(value))
        await refreshCatalog(cache)
        navigate(`/products/${result.id}`)
      } catch (reason) {
        setError(reason)
      }
    },
  })
  const fieldClass = 'grid gap-2 text-sm font-medium'
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={product ? `/products/${product.id}` : '/products'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {translate('Back to products')}
      </Link>
      <PageHeader
        eyebrow={translate('Catalog')}
        title={
          product
            ? translate('Edit {{value0}}', { value0: product.name })
            : translate('Add product')
        }
        description={translate(
          'Set a price for each fixed-weight package. Every product needs an active variant.',
        )}
      />
      <form
        id="product-form-page"
        noValidate
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.state.isSubmitting) void form.handleSubmit()
        }}
      >
        <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="grid content-start gap-section">
            <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="mb-5 text-lg font-bold">{translate('Product details')}</h2>
              <div className="grid gap-content md:grid-cols-2">
                <form.Field name="name">
                  {(field) => (
                    <label className={fieldClass}>
                      {translate('Name')}
                      <Input
                        aria-label={translate('Product name')}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder={translate('e.g. Premium wheat')}
                        required
                        maxLength={200}
                      />
                    </label>
                  )}
                </form.Field>
                <form.Field name="reference">
                  {(field) => (
                    <label className={fieldClass}>
                      {translate('Reference')}
                      <Input
                        aria-label={translate('Reference')}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder={translate('e.g. WHT-001')}
                        required
                        maxLength={80}
                      />
                    </label>
                  )}
                </form.Field>
              </div>
              <form.Field name="description">
                {(field) => (
                  <label className={`${fieldClass} mt-5`}>
                    {translate('Internal description')}
                    <Textarea
                      aria-label={translate('Internal description')}
                      value={field.state.value ?? ''}
                      onChange={(e) => field.handleChange(e.target.value || null)}
                      rows={3}
                      maxLength={2000}
                    />
                    <small className="font-normal text-[var(--muted)]">
                      {translate(
                        'The invoice prints the product name and package weight, not this description.',
                      )}
                    </small>
                  </label>
                )}
              </form.Field>
            </section>
            <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{translate('Weight variants')}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {translate('Price and cost are per package, in MAD.')}
                  </p>
                </div>
              </div>
              <form.Field name="variants">
                {(field) => (
                  <div className="grid gap-4">
                    {field.state.value.map((variant, index) => (
                      <div
                        key={variant.id ?? index}
                        className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:grid-cols-[120px_1fr_1fr_auto]"
                      >
                        <label className={fieldClass}>
                          {translate('Weight (g)')}
                          <Input
                            aria-label={translate('Variant {{value0}} weight in grams', {
                              value0: index + 1,
                            })}
                            type="number"
                            min={1}
                            step={1}
                            value={variant.weightG || ''}
                            disabled={!!variant.id}
                            onChange={(e) =>
                              field.handleChange(
                                field.state.value.map((item, i) =>
                                  i === index ? { ...item, weightG: Number(e.target.value) } : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className={fieldClass}>
                          {translate('Price per item')}
                          <Input
                            aria-label={translate('Variant {{value0}} price per item', {
                              value0: index + 1,
                            })}
                            inputMode="decimal"
                            value={variant.pricePerItem}
                            onChange={(e) =>
                              field.handleChange(
                                field.state.value.map((item, i) =>
                                  i === index ? { ...item, pricePerItem: e.target.value } : item,
                                ),
                              )
                            }
                            placeholder="0.00"
                            required
                          />
                        </label>
                        <label className={fieldClass}>
                          {translate('Cost per item')}
                          <Input
                            aria-label={translate('Variant {{value0}} cost per item', {
                              value0: index + 1,
                            })}
                            inputMode="decimal"
                            value={variant.costPerItem ?? ''}
                            onChange={(e) =>
                              field.handleChange(
                                field.state.value.map((item, i) =>
                                  i === index
                                    ? { ...item, costPerItem: e.target.value || null }
                                    : item,
                                ),
                              )
                            }
                            placeholder={translate('Optional')}
                          />
                        </label>
                        <div className="flex items-end gap-2 pb-1">
                          <label className="flex items-center gap-2 text-xs">
                            {translate('Active')}
                            <Switch
                              aria-label={translate('Variant {{value0}} active', {
                                value0: index + 1,
                              })}
                              checked={variant.active}
                              onCheckedChange={(active) =>
                                field.handleChange(
                                  field.state.value.map((item, i) =>
                                    i === index ? { ...item, active } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={translate('Remove variant {{value0}}', {
                              value0: index + 1,
                            })}
                            size="icon"
                            disabled={field.state.value.length === 1}
                            onClick={() =>
                              field.handleChange(field.state.value.filter((_, i) => i !== index))
                            }
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-fit"
                      onClick={() =>
                        field.handleChange([
                          ...field.state.value,
                          { weightG: 0, pricePerItem: '', costPerItem: null, active: true },
                        ])
                      }
                    >
                      <Plus size={16} />
                      {translate('Add variant')}
                    </Button>
                    <p className="text-xs text-[var(--muted)]">
                      {translate(
                        'Weights are unique per product. Existing weights cannot change; archive the old variant and add a new one.',
                      )}
                    </p>
                  </div>
                )}
              </form.Field>
            </section>
          </div>
          <aside className="grid content-start gap-section">
            <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="mb-4 text-lg font-bold">{translate('Organization')}</h2>
              <form.Field name="categoryId">
                {(field) => (
                  <label className={fieldClass}>
                    {translate('Category')}
                    <Combobox
                      value={field.state.value ?? ''}
                      onValueChange={(value) => field.handleChange(value || null)}
                      options={(categories.data ?? []).map((category) => ({
                        value: category.id,
                        label: `${category.name}${category.archivedAt ? ' (archived)' : ''}`,
                        keywords: [category.name],
                        disabled: !!category.archivedAt && category.id !== field.state.value,
                      }))}
                      placeholder={translate('Uncategorized')}
                      clearLabel={translate('Uncategorized')}
                      aria-label={translate('Category')}
                      loading={categories.isPending}
                      error={categories.isError}
                      onRetry={() => void categories.refetch()}
                    />
                  </label>
                )}
              </form.Field>
              <Link
                href="/products/categories"
                className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline"
              >
                {translate('Manage categories')}
              </Link>
              <form.Field name="suggestedVatRate">
                {(field) => (
                  <label className={`${fieldClass} mt-5`}>
                    {translate('Suggested VAT (%)')}
                    <Input
                      aria-label={translate('Suggested VAT')}
                      inputMode="decimal"
                      value={field.state.value ?? ''}
                      onChange={(e) => field.handleChange(e.target.value || null)}
                      placeholder={translate('None')}
                    />
                    <small className="font-normal text-[var(--muted)]">
                      {translate(
                        'Optional suggestion. It is never added to an invoice automatically.',
                      )}
                    </small>
                  </label>
                )}
              </form.Field>
            </section>
            <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="mb-4 text-lg font-bold">{translate('Product image')}</h2>
              <form.Field name="imageAssetId">
                {(field) => (
                  <MediaUploadField
                    purpose="product_image"
                    label={translate('product image')}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBusy={setUploading}
                  />
                )}
              </form.Field>
            </section>
          </aside>
        </div>
        {issues.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error-text)]"
          >
            {issues.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
        <FormError error={error} />
        <FormActionBar>
          {onReload && (
            <Button
              type="button"
              variant="outline"

              onClick={() => void onReload()}
            >
              <RotateCcw size={16} />
              {translate('Reload saved version')}
            </Button>
          )}
          <Link
            href={product ? `/products/${product.id}` : '/products'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {translate('Cancel')}
          </Link>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button type="submit" form="product-form-page" disabled={pending || uploading}>
                {pending
                  ? translate('Saving…')
                  : product
                    ? translate('Save changes')
                    : translate('Create product')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
