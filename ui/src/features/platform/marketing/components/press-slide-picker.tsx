import { Check, ChevronUp } from 'lucide-react'
import { type PointerEvent, useEffect, useId, useRef, useState } from 'react'

import { Button } from '../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuArrow,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu'
import { useMarketing } from '../hooks/marketing-context'

type Option = { id: string; label: string }
type Gesture = {
  pointerId: number
  x: number
  y: number
  startX: number
  startY: number
  held: boolean
  moved: boolean
}

// Pointer capture keeps a continuous hold/slide/release gesture across the portal.
// Radix provides dismissal, focus management, keyboard navigation and typeahead.
export function PressSlidePicker({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string
  onChange: (id: string) => void
}) {
  const { t, dark } = useMarketing()
  const hintId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const frame = useRef(0)
  const suppressClickUntil = useRef(0)
  const [open, setOpen] = useState(false)
  const [holding, setHolding] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)

  const stop = () => {
    clearTimeout(timer.current)
    cancelAnimationFrame(frame.current)
    const previous = gesture.current
    gesture.current = null
    if (previous && trigger.current?.hasPointerCapture(previous.pointerId))
      trigger.current.releasePointerCapture(previous.pointerId)
    setHolding(false)
    setPreview(null)
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      cancelAnimationFrame(frame.current)
    },
    [],
  )
  useEffect(() => {
    const cancel = () => {
      stop()
      setOpen(false)
    }
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [])

  const optionAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-press-option]')
    return element && panel.current?.contains(element) ? Number(element.dataset.pressOption) : null
  }
  const track = () => {
    const current = gesture.current
    if (!current?.held) return
    const box = panel.current?.getBoundingClientRect()
    if (
      box &&
      current.x >= box.left &&
      current.x <= box.right &&
      current.y >= box.top &&
      current.y <= box.bottom
    ) {
      const speed = current.y < box.top + 28 ? -5 : current.y > box.bottom - 28 ? 5 : 0
      if (speed && panel.current) panel.current.scrollTop += speed
    }
    setPreview(optionAt(current.x, current.y))
    frame.current = requestAnimationFrame(track)
  }
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    // Override the default immediate pointer opening; allow a deliberate hold.
    event.preventDefault()
    stop()
    suppressClickUntil.current = 0
    trigger.current?.focus({ preventScroll: true })
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      held: false,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    timer.current = setTimeout(() => {
      if (!gesture.current || gesture.current.moved) return
      gesture.current.held = true
      setHolding(true)
      setOpen(true)
      frame.current = requestAnimationFrame(track)
    }, 350)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    current.x = event.clientX
    current.y = event.clientY
    if (!current.held && Math.hypot(current.x - current.startX, current.y - current.startY) > 12) {
      current.moved = true
      clearTimeout(timer.current)
    }
    if (current.held) event.preventDefault()
  }
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    suppressClickUntil.current = performance.now() + 600
    const selected = current.held ? optionAt(event.clientX, event.clientY) : null
    const held = current.held
    const moved = current.moved
    stop()
    if (held) {
      setOpen(false)
      if (selected !== null && options[selected]) onChange(options[selected].id)
    } else if (!moved) setOpen((previous) => !previous)
  }
  const cancel = () => {
    if (!gesture.current) return
    suppressClickUntil.current = performance.now() + 600
    stop()
    setOpen(false)
  }
  const choose = (id: string) => {
    stop()
    setOpen(false)
    onChange(id)
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        if (!next) stop()
        setOpen(next)
      }}
    >
      <span className="sr-only" id={hintId}>
        {t(
          'Hold, slide to a section, then release. You can also tap to open, or use the keyboard.',
        )}
      </span>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          ref={trigger}
          className="press-picker-trigger"
          data-holding={holding}
          aria-label={t('Choose a step: {{label}}', {
            label: options.find((option) => option.id === value)?.label ?? '',
          })}
          aria-describedby={hintId}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            if (performance.now() < suppressClickUntil.current) {
              event.preventDefault()
              return
            }
            if (event.detail === 0) setOpen((previous) => !previous)
          }}
        >
          <span>{options.find((option) => option.id === value)?.label}</span>
          <ChevronUp size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={panel}
        side="top"
        align="center"
        sideOffset={14}
        collisionPadding={12}
        className={`marketing-portal press-picker-menu${dark ? ' is-dark' : ''}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          trigger.current?.focus({ preventScroll: true })
        }}
        onInteractOutside={(event) => {
          if (gesture.current?.held) event.preventDefault()
        }}
        onEscapeKeyDown={cancel}
      >
        <DropdownMenuLabel className="press-picker-heading">
          {holding ? t('Slide, then release') : t('Go to a section')}
        </DropdownMenuLabel>
        {options.map((option, index) => (
          <DropdownMenuItem
            key={option.id}
            textValue={option.label}
            data-press-option={index}
            data-preview={preview === index}
            className="press-picker-option"
            aria-current={option.id === value ? 'step' : undefined}
            onSelect={() => choose(option.id)}
          >
            <span className="press-picker-number">{String(index + 1).padStart(2, '0')}</span>
            <span>{option.label}</span>
            {option.id === value && <Check size={14} />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuArrow className="press-picker-arrow" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
