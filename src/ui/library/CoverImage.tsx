import { useState } from 'preact/hooks'

export interface CoverBook {
  title: string
  normTitle: string
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
  /** Cover URL. Omitted: only the titled placeholder shows. */
  src?: string
  class?: string
}

/**
 * Cover thumbnail. The titled placeholder is always rendered underneath; when `src` is set an
 * img is layered on top, invisible until it loads and removed if it fails. Load/error state is
 * keyed by the src it belongs to, so changing `src` resets it without an effect.
 */
export function CoverImage({ book, src, class: className }: CoverImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const loaded = src !== undefined && loadedSrc === src
  const failed = src !== undefined && failedSrc === src
  const showImg = src !== undefined && !failed

  const hue = placeholderHue(book.normTitle)
  const base = 'relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2'

  return (
    <div class={className ? `${base} ${className}` : base}>
      <div
        role="img"
        aria-label={book.title}
        style={`background: hsl(${hue} 45% 40%)`}
        class="flex size-full items-end p-2 text-white text-fluid-sm font-medium line-clamp-4"
      >
        {book.title}
      </div>
      {showImg && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          class={`absolute inset-0 size-full object-cover${loaded ? '' : ' invisible'}`}
        />
      )}
    </div>
  )
}
