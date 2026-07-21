import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Plays a looping background song (a real audio file) behind the page.
 *
 * Crucially it NEVER autoplays — the <audio> element is only created and
 * started on the first user gesture (the music toggle), which keeps browser
 * autoplay policies happy. Returns { playing, toggle } with smooth volume
 * fades in / out. Pausing keeps the playback position, so toggling back on
 * resumes where the track left off.
 *
 * The track lives in each site's /public folder and is served from the site's
 * base URL — e.g. https://…/wedding/music/one-life.mp3
 */
export function useAmbientAudio({ src = 'music/one-life.mp3', volume = 0.6 } = {}) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const rafRef = useRef(0)

  // Lazily create the <audio> element on first use so nothing loads or plays
  // before the guest actually asks for music.
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current
    const base = import.meta.env.BASE_URL || '/'
    const url = /^https?:\/\//.test(src) ? src : base + String(src).replace(/^\//, '')
    const el = new Audio(url)
    el.loop = true
    el.preload = 'auto'
    el.volume = 0
    audioRef.current = el
    return el
  }, [src])

  // Manual volume ramp (HTMLMediaElement has no built-in fade). Pauses the
  // element once a fade-out reaches silence.
  const fadeTo = useCallback((target, ms) => {
    const el = audioRef.current
    if (!el) return
    cancelAnimationFrame(rafRef.current)
    const from = el.volume
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms)
      el.volume = Math.max(0, Math.min(1, from + (target - from) * t))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else if (target === 0) {
        el.pause()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  const toggle = useCallback(async () => {
    const el = ensureAudio()
    if (!playing) {
      try {
        await el.play()
        setPlaying(true)
        fadeTo(volume, 2200)
      } catch {
        // Autoplay blocked, or the file is missing / not yet uploaded —
        // stay paused rather than throwing.
        setPlaying(false)
      }
    } else {
      setPlaying(false)
      fadeTo(0, 1400)
    }
  }, [ensureAudio, fadeTo, playing, volume])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      const el = audioRef.current
      if (el) {
        try {
          el.pause()
          el.src = ''
        } catch {
          /* ignore teardown races */
        }
      }
    }
  }, [])

  return { playing, toggle }
}
