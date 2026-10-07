import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'
import { formControlStyles } from './form-control-styles'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(formControlStyles, 'flex min-h-28 w-full px-3 py-2', className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
