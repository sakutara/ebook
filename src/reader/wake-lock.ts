/**
 * Keeps the screen on while reading via the Screen Wake Lock API. Browsers release the lock
 * whenever the page is hidden, so we re-request it when the page becomes visible again.
 * Unsupported browsers (or a denied request) are silently ignored.
 */
interface Sentinel {
  release(): Promise<void>
}

export function startWakeLock(): () => void {
  const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } })
    .wakeLock
  if (!wl) return () => {}
  let sentinel: Sentinel | null = null
  let stopped = false

  const acquire = async (): Promise<void> => {
    if (stopped || sentinel || document.visibilityState !== 'visible') return
    try {
      const s = await wl.request('screen')
      if (stopped) {
        void s.release().catch(() => {})
        return
      }
      sentinel = s
      ;(s as unknown as EventTarget).addEventListener?.('release', () => {
        if (sentinel === s) sentinel = null
      })
    } catch {
      // Denied (low battery, no gesture, ...): reading still works, the screen may dim.
    }
  }
  const onVisible = (): void => void acquire()

  void acquire()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    const s = sentinel
    sentinel = null
    void s?.release().catch(() => {})
  }
}
