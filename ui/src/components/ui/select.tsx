import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Children, type ComponentProps, isValidElement, type ReactNode, useState } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { formControlStyles } from './form-control-styles'

const emptyValue = '__slama_empty_option__'
export const SelectGroup = SelectPrimitive.Group
const encode = (value: string | number) => String(value) || emptyValue

export function SelectOption({
  value,
  children,
  disabled,
}: {
  value?: string | number
  children: ReactNode
  disabled?: boolean
}) {
  useUiLanguage()

  return (
    <SelectPrimitive.Item
      value={encode(value ?? String(children))}
      data-value={String(value ?? children)}
      disabled={disabled}
      className="relative flex cursor-default select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-[var(--accent-soft)] data-[highlighted]:text-[var(--accent)] data-[disabled]:opacity-40"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check size={16} />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

type Props = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  'defaultValue' | 'value' | 'onChange'
> & {
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  name?: string
  required?: boolean
}

/** Shared shadcn/Radix select; empty values remain usable for optional fields and filters. */
export function Select({
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  children,
  className,
  ...props
}: Props) {
  useUiLanguage()

  const [open, setOpen] = useState(false)
  const first = Children.toArray(children).find(isValidElement)
  const initial =
    defaultValue ??
    (isValidElement<{ value?: string | number; children?: ReactNode }>(first)
      ? (first.props.value ?? String(first.props.children))
      : '')
  return (
    <SelectPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      name={name}
      required={required}
      disabled={disabled}
      value={value === undefined ? undefined : encode(value)}
      defaultValue={encode(initial)}
      onValueChange={(next) => onValueChange?.(next === emptyValue ? '' : next)}
    >
      <SelectPrimitive.Trigger
        {...props}
        className={cn(
          formControlStyles,
          'ui-action flex h-control w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-3 text-left [&>span]:truncate',
          className,
        )}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate" />
        <SelectPrimitive.Icon className="shrink-0">
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-[100] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text)] shadow-lg',
            localStorage.getItem('slama-theme') === 'dark' && 'is-dark',
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex justify-center py-1">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex justify-center py-1">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
