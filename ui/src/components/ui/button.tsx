import { cva, type VariantProps } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

import { cn } from '../../lib/utils'
import { formControlStyles } from './form-control-styles'

export const buttonVariants = cva(
  'ui-action inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        field: formControlStyles,
        default:
          'border border-[var(--primary-border)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]',
        destructive:
          'border border-[var(--destructive-border)] bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive-hover)]',
        outline:
          'border border-[var(--border)] bg-[var(--secondary-action)] text-[var(--text)] hover:bg-[var(--surface-hover)]',
        ghost:
          'border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        brand:
          'border border-[var(--accent)] bg-[var(--accent)] text-[var(--brand-foreground)] hover:bg-[var(--accent-hover)]',
      },
      size: {
        default: 'h-control px-3 py-1.5',
        sm: 'h-9 px-3 py-1.5',
        md: 'h-10 px-3 py-2',
        lg: 'h-control-lg px-4 py-2',
        icon: 'size-action p-0',
        'icon-md': 'size-10 p-0',
        'icon-lg': 'size-control p-0',
        tile: 'h-auto p-3',
        cell: 'h-11 w-full p-0 tabular-nums',
      },
      shape: { default: 'rounded-control', round: 'rounded-full' },
    },
    defaultVariants: { variant: 'default', size: 'default', shape: 'default' },
  },
)
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
>(({ className, variant, size, shape, ...props }, ref) => {
  return (
    <button
      ref={ref}
      data-variant={variant ?? 'default'}
      data-size={size ?? 'default'}
      className={cn(buttonVariants({ variant, size, shape }), className)}
      {...props}
    />
  )
})
Button.displayName = 'Button'
