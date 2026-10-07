import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import { FormActionBar } from '../../../components/management/form-action-bar'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { refreshCatalog, useCatalogActions, useCategory } from '../queries'

export function CategoryFormPage() {
  useUiLanguage()

  const { categoryId } = useParams<{ categoryId?: string }>()
  const query = useCategory(categoryId ?? '', Boolean(categoryId))
  const [draft, setDraft] = useState<{ id?: string; name: string; description: string }>({
    name: '',
    description: '',
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const api = useCatalogActions()
  const cache = useQueryClient()
  const [, navigate] = useLocation()
  const saved = categoryId ? query.data : undefined
  const value =
    saved && draft.id !== saved.id
      ? { id: saved.id, name: saved.name, description: saved.description ?? '' }
      : draft
  if (categoryId && (query.isPending || query.isError))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value.name.trim()) return setError('Category name is required.')
    setPending(true)
    setError('')
    try {
      const data = { name: value.name.trim(), description: value.description.trim() || null }
      const result = saved
        ? await api.updateCategory(saved.id, { ...data, expectedVersion: saved.version })
        : await api.createCategory(data)
      await refreshCatalog(cache)
      navigate(`/products/categories/${result.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate('Could not save category.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={saved ? `/products/categories/${saved.id}` : '/products/categories'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {translate('Back to categories')}
      </Link>
      <PageHeader
        eyebrow={translate('Catalog')}
        title={saved ? translate('Edit category') : translate('New category')}
        description={translate('A simple group for organizing products.')}
      />
      <form id="category-form-page" onSubmit={submit} className="grid gap-content">
        <div className="grid gap-content lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="grid content-start gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <label className="grid gap-2 text-sm font-semibold">
              {translate('Name')}
              <Input
                value={value.name}
                maxLength={120}
                onChange={(event) => setDraft({ ...value, name: event.target.value })}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              {translate('Description')}
              <Textarea
                className="min-h-32"
                value={value.description}
                maxLength={1000}
                onChange={(event) => setDraft({ ...value, description: event.target.value })}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-[var(--error-text)]">
                {error}
              </p>
            )}
          </section>
          <aside className="grid content-start gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <p className="text-sm text-[var(--muted)]">
              {translate(
                'Products can be assigned to this category from their create or edit page.',
              )}
            </p>
          </aside>
        </div>
        <FormActionBar>
          <Link
            href={saved ? `/products/categories/${saved.id}` : '/products/categories'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {translate('Cancel')}
          </Link>
          <Button type="submit" form="category-form-page" disabled={pending}>
            <Save size={16} />
            {pending
              ? translate('Saving…')
              : saved
                ? translate('Save changes')
                : translate('Create category')}
          </Button>
        </FormActionBar>
      </form>
    </div>
  )
}
