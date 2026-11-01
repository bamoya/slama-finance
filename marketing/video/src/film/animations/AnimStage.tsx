import { useLayoutEffect, useRef } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { theme } from '../../theme'
import { ANIM_CSS, ANIM_OVERRIDES } from './css'

/**
 * Stage for an approved animation. The markup and CSS keyframes come straight from the approved design; every
 * frame the CSS animations are paused and seeked to frame / fps, so the render is deterministic and the timing
 * and easing are exactly the approved ones. Cursor targets are measured in the DOM (`data-t="name"`) and exposed
 * as `--name-x` / `--name-y` (px, relative to the stage) for the cursor keyframes, so they hold in any layout.
 * Layout unit `--u`: 1/100 of the 16:9 stage width, or 1/72 of the square stage.
 */
export const AnimStage = ({ cls, html }: { cls: string; html: string }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const square = width === height
  const u = width / (square ? 72 : 100)
  const ref = useRef<HTMLDivElement>(null)
  const baked = useRef(new Map<HTMLElement, string | null>())

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const k = rect.width / el.offsetWidth || 1 // Studio may scale the preview
    el.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => {
      const b = n.getBoundingClientRect()
      el.style.setProperty(`--${n.dataset.t}-x`, `${(b.left + b.width / 2 - rect.left) / k}px`)
      el.style.setProperty(`--${n.dataset.t}-y`, `${(b.top + b.height / 2 - rect.top) / k}px`)
    })
    // Seek by re-creating the animations (toggling `play`), moving them to the frame time and baking the resulting
    // values into inline styles; the live animations are then cancelled so nothing depends on the compositor clock.
    baked.current.forEach((style, node) =>
      style === null ? node.removeAttribute('style') : node.setAttribute('style', style),
    )
    baked.current.clear()
    el.classList.remove('play')
    void el.offsetWidth
    el.classList.add('play')
    const all = el.getAnimations({ subtree: true })
    for (const a of all) a.currentTime = (frame / fps) * 1000
    for (const a of all) {
      const node = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null
      if (!node) continue
      if (!baked.current.has(node)) baked.current.set(node, node.getAttribute('style'))
      a.commitStyles()
    }
    for (const a of all) a.cancel()
  })

  return (
    <AbsoluteFill style={{ background: theme.background }}>
      <style>{ANIM_CSS + ANIM_OVERRIDES}</style>
      <div
        ref={ref}
        className={`frame play${square ? ' sq' : ''}`}
        style={
          {
            '--u': `${u}px`,
            '--display': theme.font,
            position: 'absolute',
            inset: 0,
            width,
            height,
            aspectRatio: 'auto',
            border: 'none',
            borderRadius: 0,
            boxShadow: 'none',
          } as React.CSSProperties
        }
      >
        <div
          className={cls}
          style={{ position: 'absolute', inset: 0 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </AbsoluteFill>
  )
}
