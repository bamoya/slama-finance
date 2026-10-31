import { animate, useReducedMotion } from 'framer-motion'
import { useLayoutEffect } from 'react'

// One motion policy for every public page: small, one-time reveals only.
export function usePageMotion(path: string) {
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (reducedMotion) return
    const root = document.getElementById('marketing-content')
    if (!root) return
    const animations: ReturnType<typeof animate>[] = []
    const prepared = new Map<HTMLElement, { opacity: string; transform: string }>()
    const revealed = new Set<HTMLElement>()
    const prepare = (element: HTMLElement) => {
      prepared.set(element, { opacity: element.style.opacity, transform: element.style.transform })
      element.style.opacity = '0'
    }
    const reveal = (element: HTMLElement, delay = 0) => {
      if (revealed.has(element)) return
      revealed.add(element)
      animations.push(
        animate(
          element,
          { opacity: [0, 1], y: [12, 0] },
          {
            duration: 0.48,
            delay,
            ease: [0.22, 1, 0.36, 1],
            onComplete: () => {
              const previous = prepared.get(element)
              if (previous) Object.assign(element.style, previous)
            },
          },
        ),
      )
    }

    const intro = root.querySelector('.home-hero, .page-intro, .legal-heading')
    if (intro) {
      const children = Array.from(intro.children).filter((element) =>
        element.matches('.eyebrow, h1, p, .hero-actions, .hero-reassurance, .dashboard-preview'),
      ) as HTMLElement[]
      children.forEach((element, index) => {
        prepare(element)
        reveal(element, Math.min(index * 0.055, 0.22))
      })
    }

    // Stagger adjacent cards without delaying the rest of the page.
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.section-heading, .workflow-step, .feature-row > div, .split-section > div, .organization-story > div, .plan-card, .final-cta > div',
      ),
    )
    const targets = candidates.filter(
      (element) => !candidates.some((parent) => parent !== element && parent.contains(element)),
    )
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return
          const element = target as HTMLElement
          const siblings = Array.from(element.parentElement?.children || [])
          const index = Math.max(0, siblings.indexOf(element))
          reveal(
            element,
            element.matches('.plan-card, .workflow-step') ? Math.min(index * 0.06, 0.18) : 0,
          )
          observer.unobserve(element)
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' },
    )
    targets.forEach((element) => {
      prepare(element)
      observer.observe(element)
    })
    const showFocused = (event: FocusEvent) => {
      targets.forEach((element) => {
        if (event.target instanceof Node && element.contains(event.target)) {
          reveal(element)
          observer.unobserve(element)
        }
      })
    }
    root.addEventListener('focusin', showFocused)

    return () => {
      observer.disconnect()
      root.removeEventListener('focusin', showFocused)
      animations.forEach((animation) => animation.stop())
      prepared.forEach((previous, element) => Object.assign(element.style, previous))
    }
  }, [path, reducedMotion])
}
