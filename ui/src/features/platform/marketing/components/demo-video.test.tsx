import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
    HTMLMediaElement.prototype.pause = vi.fn()
  })

  it('plays the film inline muted, looped, without controls, poster first', () => {
    mockMedia([])
    const { container } = render(
      <DemoVideo name="Film" mode="film" label="Demo film" caption="Caption" />,
    )
    const video = container.querySelector('video')!
    expect(video).not.toHaveAttribute('controls')
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video).toHaveAttribute('playsinline')
    expect(video.autoplay).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.getAttribute('poster')).toBe('/marketing/videos/Film.jpg')
    expect(screen.getByText('Caption')).toBeInTheDocument()
  })

  it('opens the film in a dialog on click, still without native controls, and closes with Escape', async () => {
    mockMedia([])
    render(<DemoVideo name="Film" mode="film" label="Demo film" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge the demo: Demo film' }))
    const dialog = await screen.findByRole('dialog')
    const large = dialog.querySelector('video')!
    expect(large.querySelector('source')).toHaveAttribute('src', '/marketing/videos/Film.mp4')
    expect(large).not.toHaveAttribute('controls')
    expect(large.muted).toBe(true)
    expect(large.loop).toBe(true)
    fireEvent.play(large)
    expect(screen.getByRole('button', { name: 'Pause the video' })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the poster with a play icon under reduced motion and opens the dialog without autoplay', async () => {
    mockMedia(['prefers-reduced-motion'])
    const { container } = render(<DemoVideo name="Film" mode="film" label="Demo film" />)
    expect(container.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge the demo: Demo film' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('video')).not.toHaveAttribute('controls')
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
  })

  it('falls back to the poster when autoplay is rejected', async () => {
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
    const { container } = render(<DemoVideo name="Film" mode="film" label="Demo film" />)
    await waitFor(() => expect(container.querySelector('video')).toBeNull())
    expect(container.querySelector('.demo-video-play')).not.toBeNull()
  })

  it('plays cut-downs muted, looped, inline and without controls', () => {
    mockMedia([])
    const { container } = render(
      <DemoVideo name="Film-Facturation" mode="clip" label="Invoice demo" />,
    )
    const video = container.querySelector('video')!
    expect(video.autoplay).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('playsinline')
    expect(video).not.toHaveAttribute('controls')
  })

  it('uses the square cut-down on narrow screens', () => {
    mockMedia(['max-width'])
    const { container } = render(
      <DemoVideo name="Film-Relances" mode="clip" label="Reminders demo" />,
    )
    const video = container.querySelector('video')!
    expect(video.getAttribute('poster')).toBe('/marketing/videos/Film-Relances-Square.jpg')
    expect(video.querySelector('source')).toHaveAttribute(
      'src',
      '/marketing/videos/Film-Relances-Square.mp4',
    )
  })
})
