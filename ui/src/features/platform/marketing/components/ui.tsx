import { ArrowUpRight, X } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from 'react'
import { Link } from 'wouter'

import { Button as SharedButton, buttonVariants } from '../../../../components/ui/button'
import {
  Dialog as SharedDialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../components/ui/dialog'
import { Input } from '../../../../components/ui/input'
import { Select as SharedSelect, SelectOption } from '../../../../components/ui/select'
import { Tooltip } from '../../../../components/ui/tooltip'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { cn } from '../../../../lib/utils'
import { useMarketing } from '../hooks/marketing-context'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'default' | 'sm' | 'icon'
const variants = { primary: 'default', outline: 'outline', ghost: 'ghost' } as const
const sizes = { default: 'md', sm: 'sm', icon: 'icon-md' } as const
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = 'outline', size = 'default', className, type = 'button', ...props }, ref) => (
  <SharedButton
    ref={ref}
    type={type}
    variant={variants[variant]}
    size={sizes[size]}
    className={cn('button', `button-${variant}`, className)}
    {...props}
  />
))
Button.displayName = 'MarketingButton'
export function RouteButton({
  href,
  children,
  variant = 'outline',
  className,
}: {
  href: string
  children: ReactNode
  variant?: Variant
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: variants[variant], size: 'md' }),
        'button',
        `button-${variant}`,
        className,
      )}
    >
      {children}
    </Link>
  )
}
export function TrialButton({
  children,
  className,
  variant = 'primary',
}: {
  children?: ReactNode
  className?: string
  variant?: 'primary' | 'outline'
}) {
  const { t } = useMarketing()
  return (
    <RouteButton href={ownerAuthPaths.register} variant={variant} className={className}>
      {children || t('Start free trial')}
      <ArrowUpRight size={16} />
    </RouteButton>
  )
}
export function TextField({
  label,
  optional,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; optional?: boolean }) {
  const id = useId()
  const { t } = useMarketing()
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span className="required"> *</span>}
        {optional && <small>{t('Optional')}</small>}
      </label>
      <Input id={id} className="input" {...props} />
    </div>
  )
}
export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  label: string
}) {
  return (
    <SharedSelect
      value={value}
      onValueChange={onChange}
      aria-label={label}
      className="input select-trigger"
    >
      {options.map((option) => (
        <SelectOption key={option.value} value={option.value}>
          {option.label}
        </SelectOption>
      ))}
    </SharedSelect>
  )
}
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  const { t, dark } = useMarketing()
  return (
    <SharedDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className={cn('marketing-portal dialog-panel', dark && 'is-dark', className)}>
        <header className="dialog-heading">
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <Button size="icon" variant="ghost" aria-label={t('Close')} onClick={onClose}>
            <X size={20} />
          </Button>
        </header>
        {children}
      </DialogContent>
    </SharedDialog>
  )
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label}>
      <Button size="icon" variant="ghost" aria-label={label} {...props}>
        {children}
      </Button>
    </Tooltip>
  )
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="eyebrow">
      <i />
      {children}
    </span>
  )
}
export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="section-heading">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  )
}
export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details key={item.q}>
          <summary>
            {item.q}
            <span className="faq-plus" aria-hidden="true">
              +
            </span>
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  )
}
