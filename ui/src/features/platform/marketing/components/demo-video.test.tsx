import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DemoVideo } from './demo-video'

vi.mock('../hooks/marketing-context', () => ({
  useMarketing: () => ({ t: (key: string) => key, dark: false, locale: 'en' }),
}))

function mockMedia(matching: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((m) => query.includes(m)),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('DemoVideo', () => {
  it('autoplays the film muted and looped with visible controls and a poster', () => {
    mockMedia([])
    render(<DemoVideo name="Film" mode="film" label="Demo film" caption="Caption" />)
    const video = screen.getByLabelText('Demo film') as HTMLVideoElement
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video.autoplay).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.getAttribute('poster')).toBe('/marketing/videos/Film.jpg')
    expect(screen.getByText('Caption')).toBeInTheDocument()
  })

  it('does not autoplay the film under reduced motion', () => {
    mockMedia(['prefers-reduced-motion'])
    const { container } = render(<DemoVideo name="Film" mode="film" label="Demo film" />)
    expect(container.querySelector('video')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play the video: Demo film' })).toBeInTheDocument()
  })

  it('falls back to the play button when autoplay is rejected', async () => {
    mockMedia([])
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: (e: unknown[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: true }])
        }
        disconnect() {}
      },
    )
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new Error('blocked')))
    render(<DemoVideo name="Film" mode="film" label="Demo film" />)
    expect(
      await screen.findByRole('button', { name: 'Play the video: Demo film' }),
    ).toBeInTheDocument()
  })

  it('autoplays cut-downs muted, looped and inline', () => {
    mockMedia([])
    render(<DemoVideo name="Film-Facturation" mode="clip" label="Invoice demo" />)
    const video = screen.getByLabelText('Invoice demo') as HTMLVideoElement
    expect(video.autoplay).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video).not.toHaveAttribute('controls')
  })

  it('uses the square cut-down on narrow screens', () => {
    mockMedia(['max-width'])
    render(<DemoVideo name="Film-Relances" mode="clip" label="Reminders demo" />)
    const video = screen.getByLabelText('Reminders demo')
    expect(video.getAttribute('poster')).toBe('/marketing/videos/Film-Relances-Square.jpg')
    expect(video.querySelector('source')).toHaveAttribute(
      'src',
      '/marketing/videos/Film-Relances-Square.mp4',
    )
  })

  it('falls back to a poster with a play button under reduced motion', () => {
    mockMedia(['prefers-reduced-motion'])
    const { container } = render(
      <DemoVideo name="Film-Rapports" mode="clip" label="Reports demo" />,
    )
    expect(container.querySelector('video')).toBeNull()
    const play = screen.getByRole('button', { name: 'Play the video: Reports demo' })
    fireEvent.click(play)
    const video = container.querySelector('video')!
    expect(video).toHaveAttribute('controls')
  })
})
