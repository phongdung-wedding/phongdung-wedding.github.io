import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Plays a looping background song (a real audio file) behind the page.
 *
 * Returns { playing, toggle } with smooth volume fades in / out. Pausing keeps
 * the playback position, so toggling back on resumes where the track left off.
 *
 * Autoplay: browsers block audio-with-sound until the guest interacts with the
 * page, so true "load and play" is not allowed. With `autoplay: true` the hook
 * (1) optimistically tries to play right away — which succeeds on browsers that
 * grant it — and (2) if that is blocked, arms a one-shot listener that starts
 * the music on the guest's very first gesture anywhere (a click, tap, key press
 * or scroll — e.g. opening the envelope or hitting "Bỏ qua"). Once the guest
 * pauses the music by hand, we never force it back on.
 *
 * The track lives in each site's /public folder and is served from the site's
 * base URL — e.g. https://…/wedding/music/one-life.mp3
 */
export function useAmbientAudio({ src = 'music/one-life.mp3', volume = 0.6, autoplay = false } = {}) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const rafRef = useRef(0)
  // Set once the guest takes manual control of the toggle, so autoplay never
  // fights a deliberate pause.
  const userControlledRef = useRef(false)

  // Lazily create the <audio> element on first use so nothing loads or plays
  // before it is actually needed.
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

  // Begin (or resume) playback with a fade-in. Resolves to true if the browser
  // allowed it, false if autoplay was blocked or the file is unavailable.
  const start = useCallback(async () => {
    const el = ensureAudio()
    try {
      await el.play()
      setPlaying(true)
      fadeTo(volume, 2200)
      return true
    } catch {
      setPlaying(false)
      return false
    }
  }, [ensureAudio, fadeTo, volume])

  const stop = useCallback(() => {
    setPlaying(false)
    fadeTo(0, 1400)
  }, [fadeTo])

  const toggle = useCallback(() => {
    userControlledRef.current = true
    if (playing) stop()
    else start()
  }, [playing, start, stop])

  // Autoplay: try now, and otherwise wait for the first user gesture.
  useEffect(() => {
    if (!autoplay) return
    let cancelled = false

    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel']
    const arm = () => events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }))
    const disarm = () => events.forEach((e) => window.removeEventListener(e, onGesture))

    function onGesture() {
      disarm()
      if (!cancelled && !userControlledRef.current) start()
    }

    start().then((ok) => {
      if (cancelled || ok || userControlledRef.current) return
      arm()
    })

    return () => {
      cancelled = true
      disarm()
    }
  }, [autoplay, start])

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
