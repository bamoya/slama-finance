import { useMotionValue, useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'

import { useMarketing } from '../hooks/marketing-context'
import { PressSlidePicker } from './press-slide-picker'

export type ReadingStep = { id: string; label: string }

export function ReadingStepper({ steps }: { steps: ReadingStep[] }) {
  const { t } = useMarketing()
  const nav = useRef<HTMLElement>(null)
  const desktopLine = useRef<HTMLDivElement>(null)
  const mobileLine = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [reading, setReading] = useState(false)
  const progress = useMotionValue(0)
  const easedProgress = useSpring(progress, { stiffness: 240, damping: 35, mass: 0.5 })
  const reducedMotion = useReducedMotion()
  const lineProgress = reducedMotion ? progress : easedProgress
  const paintProgress = (value: number) => {
    for (const line of [desktopLine.current, mobileLine.current]) {
      if (line) line.style.transform = `scaleX(${value})`
    }
  }
  useMotionValueEvent(lineProgress, 'change', paintProgress)
  useEffect(() => {
    paintProgress(lineProgress.get())
  }, [lineProgress])
  // Match the floated header clearance, independent of its entrance transition.
  const readingOffset = () => (window.innerWidth <= 640 ? 110 : 120)
  const ids = steps.map((step) => step.id).join('|')

  useEffect(() => {
    let frame = 0
    const elements = ids.split('|').map((id) => document.getElementById(id))
    const update = () => {
      frame = 0
      const offset = readingOffset()
      const readingLine = window.scrollY + offset
      const first = elements[0]?.getBoundingClientRect()
      const last = elements[elements.length - 1]?.getBoundingClientRect()
      const callToAction = document
        .querySelector('.features-page > .final-cta')
        ?.getBoundingClientRect()
      setReading(
        Boolean(
          first &&
          last &&
          first.top < window.innerHeight * 0.65 &&
          last.bottom > offset + 50 &&
          (!callToAction || callToAction.top > window.innerHeight - 90),
        ),
      )
      const starts = elements.map((element) =>
        element ? element.getBoundingClientRect().top + window.scrollY : Infinity,
      )
      let index = 0
      starts.forEach((start, i) => {
        if (readingLine >= start - 2) index = i
      })
      const start = starts[index] ?? 0
      const next = starts[index + 1]
      const fraction =
        next !== undefined && Number.isFinite(next) && next > start
          ? Math.max(0, Math.min(1, (readingLine - start) / (next - start)))
          : 0
      progress.set(Math.max(0, Math.min(1, (index + fraction) / Math.max(1, starts.length - 1))))
      setActive((current) => (current === index ? current : index))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = new ResizeObserver(schedule)
    elements.forEach((element) => {
      if (element) resize.observe(element)
    })
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ids, progress])

  const goTo = (id: string) => {
    const target = document.getElementById(id)
    if (!target || !nav.current) return
    const offset = readingOffset()
    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset),
      behavior: reducedMotion ? 'instant' : 'smooth',
    })
    history.replaceState(null, '', `#${id}`)
  }
  const onStepClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return
    event.preventDefault()
    goTo(id)
  }
  const next = steps[active + 1]
  return (
    <nav
      ref={nav}
      className="reading-stepper"
      data-reading={reading}
      aria-label={t('Feature reading progress')}
    >
      <div className="reading-stepper-panel">
        <div className="reading-desktop">
          <div className="reading-track" aria-hidden="true">
            <div ref={desktopLine} style={{ transform: 'scaleX(0)' }} />
          </div>
          <ol>
            {steps.map((step, index) => (
              <li key={step.id}>
                <a
                  href={`#${step.id}`}
                  className={`reading-step ${index < active ? 'is-complete' : ''}`}
                  aria-current={index === active ? 'step' : undefined}
                  aria-label={t('Step {{step}} of {{total}}: {{label}}', {
                    step: index + 1,
                    total: steps.length,
                    label: step.label,
                  })}
                  onClick={(event) => onStepClick(event, step.id)}
                >
                  <span className="reading-marker" aria-hidden="true">
                    {index < active ? <Check size={15} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{step.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
        <div className="reading-mobile">
          <div className="reading-mobile-row">
            <span
              className="reading-count"
              aria-label={t('Step {{step}} of {{total}}', {
                step: active + 1,
                total: steps.length,
              })}
            >
              {String(active + 1).padStart(2, '0')}
              <span> / {String(steps.length).padStart(2, '0')}</span>
            </span>
            <div className="reading-mobile-current">
              <PressSlidePicker
                options={steps}
                value={steps[active]?.id ?? steps[0]?.id ?? ''}
                onChange={goTo}
              />
            </div>
            {next ? (
              <a
                className="reading-next"
                href={`#${next.id}`}
                onClick={(event) => onStepClick(event, next.id)}
              >
                {t('Next')}
                <ArrowRight size={13} />
              </a>
            ) : (
              <Link className="reading-next" href="/tarifs">
                {t('Pricing')}
                <ArrowRight size={13} />
              </Link>
            )}
          </div>
          <div className="reading-mobile-track" aria-hidden="true">
            <div ref={mobileLine} style={{ transform: 'scaleX(0)' }} />
          </div>
        </div>
      </div>
    </nav>
  )
}
