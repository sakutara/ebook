import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

/**
 * Reveals `items` in pages of `step`. A callback ref (`sentinelRef`) is attached to a
 * sentinel element; each time it intersects (within `rootMargin` of the viewport) the
 * visible count grows by `step`, capped at `items.length`. The count resets to `step`
 * whenever the `items` array identity changes.
 */
export function useIncrementalList<T>(
  items: T[],
  step = 40,
  rootMargin = '600px',
): { visible: T[]; sentinelRef: (el: Element | null) => void; hasMore: boolean } {
  const [count, setCount] = useState(step)
  const total = items.length

  const totalRef = useRef(total)
  totalRef.current = total

  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    setCount(step)
  }, [items, step])

  useEffect(() => {
    return () => {
      observer.current?.disconnect()
      observer.current = null
    }
  }, [])

  const sentinelRef = useCallback(
    (el: Element | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!el) return
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setCount((c) => Math.min(c + step, totalRef.current))
          }
        },
        { rootMargin },
      )
      obs.observe(el)
      observer.current = obs
    },
    [step, rootMargin],
  )

  const shown = Math.min(count, total)
  return {
    visible: items.slice(0, shown),
    sentinelRef,
    hasMore: shown < total,
  }
}
