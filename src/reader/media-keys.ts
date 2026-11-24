/**
 * Page turning from media buttons (Bluetooth headset / page-turner remote / lock screen).
 * Browsers cannot see the phone's own volume keys, but a page that is playing audio owns the
 * Media Session, so previoustrack/nexttrack arrive as actions. We keep a looping silent clip
 * playing to hold that session. Playback needs a user gesture, so call `arm()` from one.
 */
export interface MediaKeys {
  arm(): void
  stop(): void
}

function silentWavUrl(): string {
  const rate = 8000
  const n = rate // 1 second
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128) // 8-bit PCM silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export function startMediaKeys(opts: { title: string; onPrev: () => void; onNext: () => void }): MediaKeys | null {
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
  if (!ms || typeof Audio === 'undefined') return null

  const url = silentWavUrl()
  const audio = new Audio(url)
  audio.loop = true
  let stopped = false

  const setActions = (): void => {
    ms.metadata = new MediaMetadata({ title: opts.title || 'Đang đọc', artist: 'Lật trang' })
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null): void => {
      try {
        ms.setActionHandler(a, h)
      } catch {
        // Action unsupported on this browser.
      }
    }
    set('previoustrack', opts.onPrev)
    set('nexttrack', opts.onNext)
    set('seekbackward', opts.onPrev)
    set('seekforward', opts.onNext)
    // Remotes often send play/pause for their single button: treat as "next page" and keep playing.
    set('play', () => {
      opts.onNext()
      void audio.play().catch(() => {})
    })
    set('pause', () => {
      opts.onNext()
      void audio.play().catch(() => {})
    })
  }
  setActions()

  return {
    arm() {
      if (stopped || !audio.paused) return
      void audio.play().catch(() => {
        // Not allowed yet (no gesture): the next tap tries again.
      })
    },
    stop() {
      stopped = true
      audio.pause()
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      for (const a of ['previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'play', 'pause'] as const) {
        try {
          ms.setActionHandler(a, null)
        } catch {
          // ignore
        }
      }
      ms.metadata = null
    },
  }
}
