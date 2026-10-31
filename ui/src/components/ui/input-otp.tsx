import { OTPInput, OTPInputContext } from 'input-otp'
import { Minus } from 'lucide-react'
import { type ComponentProps, useContext } from 'react'

import { cn } from '../../lib/utils'

export function InputOTP({
  className,
  containerClassName,
  ...props
}: ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn('flex items-center gap-2 has-disabled:opacity-50', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

export function InputOTPGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />
  )
}

export function InputOTPSlot({
  index,
  className,
  ...props
}: ComponentProps<'div'> & { index: number }) {
  const context = useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {}
  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex size-11 items-center justify-center border-y border-r border-[var(--border)] bg-[var(--surface)] text-base font-semibold text-[var(--text)] transition-colors first:rounded-l-lg first:border-l last:rounded-r-lg data-[active=true]:z-10 data-[active=true]:border-[var(--accent)] data-[active=true]:ring-2 data-[active=true]:ring-[var(--accent)]',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-pulse bg-[var(--text)] [animation-duration:1s]" />
        </div>
      )}
    </div>
  )
}

export function InputOTPSeparator(props: ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <Minus className="text-[var(--muted)]" aria-hidden="true" />
    </div>
  )
}
