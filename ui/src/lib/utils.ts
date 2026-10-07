import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Keep size overrides deterministic when components use shared density utilities.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        'page',
        'panel',
        'surface',
        'section',
        'content',
        'control',
        'control-lg',
        'action',
      ],
      borderRadius: ['panel', 'control'],
    },
  },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
