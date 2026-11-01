import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useMarketing } from '../hooks/marketing-context'

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

/**
 * Product demo video. `film` is the long film: poster first, native controls, never autoplays.
 * `clip` is a short cut-down: muted loop that only plays while visible; with reduced motion
 * it shows the poster with a play button until the visitor asks for playback.
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
  const [requested, setRequested] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  const isFilm = mode === 'film'
  const square = !isFilm && narrow
  const stem = `${videoBase}${name}${square ? '-Square' : ''}`
  const poster = `${stem}.jpg`
  const needsPlayButton = (reduced || blocked) && !requested
  const autoplay = !reduced && !blocked
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
  return (
    <figure
      className={`demo-video ${isFilm ? 'demo-video-film' : 'demo-video-clip'} ${dark ? 'is-dark' : 'is-light'} ${className}`}
    >
      <div className="demo-video-frame">
        {needsPlayButton ? (
          <button
            type="button"
            className="demo-video-poster"
            aria-label={`${t('Play the video')}: ${label}`}
            onClick={() => setRequested(true)}
          >
            <img src={poster} alt="" width={square ? 720 : 1280} height={square ? 720 : 720} />
            <span className="demo-video-play" aria-hidden>
              <Play size={22} fill="currentColor" />
            </span>
          </button>
        ) : (
          <video
            ref={ref}
            key={stem}
            aria-label={label}
            poster={poster}
            controls={isFilm || requested}
            autoPlay={autoplay || requested}
            muted
            loop
            playsInline
            preload="metadata"
          >
            <source src={`${stem}.mp4`} type="video/mp4" />
          </video>
        )}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
