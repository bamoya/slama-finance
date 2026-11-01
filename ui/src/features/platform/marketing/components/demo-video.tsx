import { Maximize2, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useMarketing } from '../hooks/marketing-context'
import { Dialog } from './ui'

const videoBase = '/marketing/videos/'
export type DemoVideoName =
  'Film' | 'Film-Facturation' | 'Film-Relances' | 'Film-Rapports' | 'Film-Modeles'

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [query])
  return matches
}

/** Large playback of the demo inside the marketing dialog: muted loop, no native controls. */
function DialogVideo({
  stem,
  poster,
  label,
  startAt,
  autoplay,
}: {
  stem: string
  poster: string
  label: string
  startAt: number
  autoplay: boolean
}) {
  const { t } = useMarketing()
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    try {
      if (startAt > 0) video.currentTime = startAt
    } catch {
      /* metadata not ready; start from the beginning */
    }
    if (autoplay) void video.play?.()?.catch?.(() => setPlaying(false))
  }, [autoplay, startAt])
  const toggle = () => {
    const video = ref.current
    if (!video) return
    if (video.paused) void video.play?.()?.catch?.(() => setPlaying(false))
    else video.pause?.()
  }
  return (
    <div className="demo-video-large">
      <video
        ref={ref}
        aria-label={label}
        poster={poster}
        muted
        loop
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
      >
        <source src={`${stem}.mp4`} type="video/mp4" />
      </video>
      <button
        type="button"
        className="demo-video-toggle"
        aria-label={playing ? t('Pause the video') : t('Play the video')}
        onClick={toggle}
      >
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
    </div>
  )
}

/**
 * Product demo video, read-only everywhere: muted loop with no controls that only plays while
 * visible (poster first). With reduced motion it stays on the poster with a play icon. Clicking
 * the video opens it large in a dialog, continuing from the current time.
 */
export function DemoVideo({
  name,
  mode,
  label,
  caption,
  className = '',
}: {
  name: DemoVideoName
  mode: 'film' | 'clip'
  label: string
  caption?: string
  className?: string
}) {
  const { t, dark } = useMarketing()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const narrow = useMediaQuery('(max-width: 640px)')
  const [blocked, setBlocked] = useState(false)
  const [open, setOpen] = useState(false)
  const [startAt, setStartAt] = useState(0)
  const ref = useRef<HTMLVideoElement>(null)
  const isFilm = mode === 'film'
  const square = !isFilm && narrow
  const stem = `${videoBase}${name}${square ? '-Square' : ''}`
  const poster = `${stem}.jpg`
  const showPoster = reduced || blocked
  const autoplay = !showPoster && !open
  useEffect(() => {
    const video = ref.current
    if (!video || !autoplay || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) void video.play?.()?.catch?.(() => setBlocked(true))
        else video.pause?.()
      },
      { threshold: 0.25 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [autoplay, stem])
  const expand = () => {
    const video = ref.current
    setStartAt(video?.currentTime ?? 0)
    video?.pause?.()
    setOpen(true)
  }
  const enlargeLabel = `${t('Enlarge the demo')}: ${label}`
  return (
    <figure
      className={`demo-video ${isFilm ? 'demo-video-film' : 'demo-video-clip'} ${dark ? 'is-dark' : 'is-light'} ${className}`}
    >
      <div className="demo-video-frame">
        <button
          type="button"
          className="demo-video-poster"
          aria-label={enlargeLabel}
          onClick={expand}
        >
          {showPoster ? (
            <>
              <img src={poster} alt="" width={square ? 720 : 1280} height={720} />
              <span className="demo-video-play" aria-hidden>
                <Play size={22} fill="currentColor" />
              </span>
            </>
          ) : (
            <video
              ref={ref}
              key={stem}
              poster={poster}
              autoPlay={autoplay}
              muted
              loop
              playsInline
              preload="metadata"
            >
              <source src={`${stem}.mp4`} type="video/mp4" />
            </video>
          )}
          <span className="zoom-label" aria-hidden>
            <Maximize2 size={13} />
            {t('Enlarge')}
          </span>
        </button>
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
      <Dialog
        className="preview-dialog demo-video-dialog"
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={caption ?? t('Demonstration with fictional data')}
      >
        <DialogVideo
          stem={`${videoBase}${name}${square ? '-Square' : ''}`}
          poster={poster}
          label={label}
          startAt={startAt}
          autoplay={!reduced}
        />
      </Dialog>
    </figure>
  )
}
