import { useEffect, useRef } from 'preact/hooks'

/**
 * Lets the system back button (Android back, browser back, iOS swipe) close an overlay instead of
 * leaving the page. While `open`, one history entry marked `overlay` sits on top; going back pops
 * it and calls `close`. Closing in-page removes the entry again, unless a navigation already
 * replaced it (see `navigate`).
 */
export function useBackClose(open: boolean, close: () => void): void {
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    if (!open) return
    const prev: unknown = history.state
    const base = typeof prev === 'object' && prev !== null ? prev : {}
    history.pushState({ ...base, overlay: true }, '')
    let pushed = true
    const onPop = () => {
      if (!pushed) return
      pushed = false
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!pushed) return
      pushed = false
      const s: unknown = history.state
      // Still our entry on top: drop it. A navigation that replaced it needs nothing.
      if (typeof s === 'object' && s !== null && (s as { overlay?: boolean }).overlay === true) history.back()
    }
  }, [open])
}
