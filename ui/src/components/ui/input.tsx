import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'
import { DateInput } from './date-input'
import { formControlStyles } from './form-control-styles'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    if (props.type === 'date')
      return <DateInput ref={ref} className={className} {...props} type={undefined} />
    return (
      <input
        ref={ref}
        data-slot="input"
        className={cn(formControlStyles, 'flex h-control w-full px-3 py-2', className)}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
