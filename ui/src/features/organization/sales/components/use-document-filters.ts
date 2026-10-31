import { useSearchParams } from 'wouter'

export type FilterOption = { value: string; label: string }

export function useDocumentFilters(allowed: Record<string, readonly string[]>) {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => {
    const value = params.get(key) ?? ''
    const choices = allowed[key]
    return choices && !choices.includes(value) ? '' : value
  }
  const number = (key: string) => {
    const value = get(key)
    return value !== '' && /^\d+(\.\d{1,2})?$/.test(value) ? value : ''
  }
  const pageValue = Number(params.get('page') ?? '1')
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1
  const set = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  }
  const reset = () => setParams(new URLSearchParams(), { replace: true })
  const setMany = (values: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        next.delete('page')
        return next
      },
      { replace: true },
    )
  return {
    scope: params.toString(),
    get,
    number,
    page,
    set,
    setMany,
    reset,
    active: [...params.keys()].some((key) => key !== 'page'),
  }
}
