import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

export interface CoverBook {
  id: string
  title: string
  normTitle: string
  md5: string
}

/** Deterministic hue (0..359) for a title's placeholder background. */
export function placeholderHue(normTitle: string): number {
  let h = 0
  for (let i = 0; i < normTitle.length; i++) {
    h = (h * 31 + normTitle.charCodeAt(i)) >>> 0
  }
  return h % 360
}

interface CoverImageProps {
  book: CoverBook
  get: (book: CoverBook) => Promise<Blob | null | undefined>
  class?: string
}

/**
 * Cover thumbnail that loads lazily: `get` is only called once the wrapper comes within
 * 300px of the viewport. Until a blob arrives (or when none exists) a titled placeholder shows.
 */
export function CoverImage({ book, get, class: className }: CoverImageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wanted, setWanted] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const md5 = book.md5

  // Observe for first intersection; restart on md5 change.
  useEffect(() => {
    setWanted(false)
    setUrl(null)
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect()
          setWanted(true)
        }
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [md5])

  // Fetch once when wanted; ignore results that arrive after md5 changes or unmount.
  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    get(book)
      .then((blob) => {
        if (cancelled) return
        setUrl(blob ? URL.createObjectURL(blob) : null)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
    // `book` identity is intentionally keyed by md5 only.
  }, [wanted, md5])

  // Revoke the object URL when it changes or on unmount. Layout effect so the cleanup is
  // registered at commit time (passive effects may not have run before an early unmount).
  useLayoutEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  const hue = placeholderHue(book.normTitle)
  const base = 'relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2'

  return (
    <div ref={wrapRef} class={className ? `${base} ${className}` : base}>
      {url ? (
        <img src={url} alt="" class="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div
          role="img"
          aria-label={book.title}
          style={`background: hsl(${hue} 45% 40%)`}
          class="flex size-full items-end p-2 text-white text-fluid-sm font-medium line-clamp-4"
        >
          {book.title}
        </div>
      )}
    </div>
  )
}
