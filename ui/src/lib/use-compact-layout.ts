import { useSyncExternalStore } from 'react'

/** Shared phone/tablet breakpoint; matches Tailwind's lg boundary. */
export function useCompactLayout() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia('(max-width: 1023px)')
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia('(max-width: 1023px)').matches,
    () => false,
  )
}
