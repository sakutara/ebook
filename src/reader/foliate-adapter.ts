import type { ReaderAdapter } from './adapter'
import type { RelocateInfo } from '../progress/anchor'
import { buildTextIndex, findNearest } from './text-index'
import { installBlobSafeTransform } from './blob-safe'

/** foliate-js ships no type declarations; the view is only touched through this boundary type. */
type FoliateView = any

interface FoliateTocItem {
  label: string
  href: string
  subitems?: FoliateTocItem[]
}

interface FoliateRelocateDetail {
  cfi: string
  fraction?: number
  range?: Range
  tocItem?: { label?: string }
}

interface RendererRelocateDetail {
  index: number
  fraction?: number
}

interface LoadDetail {
  doc: Document
  index: number
}

type RelocateCallback = (info: RelocateInfo & { tocLabel?: string }) => void

function mapToc(items: FoliateTocItem[] | undefined): { label: string; href: string; subitems?: { label: string; href: string }[] }[] {
  return (items ?? []).map((item) => {
    const subitems = mapToc(item.subitems)
    return subitems.length > 0
      ? { label: item.label, href: item.href, subitems }
      : { label: item.label, href: item.href }
  })
}

/**
 * Create a foliate-js backed reader. The only module in the app that imports foliate-js/view.js.
 * Dynamic import keeps the engine out of the main bundle until a book is opened.
 */
export async function createFoliateAdapter(
  container: HTMLElement,
  opts?: { onSectionLoad?: (doc: Document, index: number) => void },
): Promise<ReaderAdapter> {
  await import('foliate-js/view.js')

  const view: FoliateView = document.createElement('foliate-view')
  view.style.display = 'block'
  view.style.width = '100%'
  view.style.height = '100%'
  container.append(view)

  const subscribers = new Set<RelocateCallback>()
  // Latest section-level position, reported by the paginator ('relocate' on view.renderer).
  let last: { index: number; fraction: number } = { index: 0, fraction: 0 }
  // Removes the blob-safe 'data' listener installed on the current book (see open()).
  let releaseBlobTransform: (() => void) | null = null

  const emit = (detail: FoliateRelocateDetail) => {
    // The view's relocate fires from inside the renderer's dispatch, before the adapter's
    // renderer listener has recorded the new section. Deferring to a microtask lets the
    // synchronous dispatch finish, so `last` reflects this same move.
    queueMicrotask(() => {
      const info: RelocateInfo & { tocLabel?: string } = {
        cfi: detail.cfi,
        fraction: detail.fraction ?? 0,
        rangeText: detail.range?.toString() ?? '',
        sectionIndex: last.index,
        sectionHref: view.book?.sections[last.index]?.id ?? '',
        sectionFraction: last.fraction ?? 0,
        tocLabel: detail.tocItem?.label,
      }
      for (const cb of subscribers) cb(info)
    })
  }

  view.addEventListener('load', (e: Event) => {
    const { doc, index } = (e as CustomEvent<LoadDetail>).detail
    opts?.onSectionLoad?.(doc, index)
  })
  view.addEventListener('relocate', (e: Event) => {
    emit((e as CustomEvent<FoliateRelocateDetail>).detail)
  })

  return {
    async open(file: File): Promise<void> {
      await view.open(file)
      // view.open() only builds the renderer; sections load later on goTo/init, so the
      // listener is in place before any chapter is requested.
      releaseBlobTransform?.()
      releaseBlobTransform = view.book?.transformTarget
        ? installBlobSafeTransform(view.book.transformTarget)
        : null
      const renderer: FoliateView = view.renderer
      renderer.addEventListener('relocate', (e: Event) => {
        const { index, fraction } = (e as CustomEvent<RendererRelocateDetail>).detail
        last = { index, fraction: fraction ?? 0 }
      })
      renderer.setAttribute('flow', 'paginated')
      renderer.setAttribute('max-inline-size', '40rem')
      renderer.setAttribute('gap', '6%')
      renderer.setAttribute('margin', '48px')
    },

    sections() {
      return (view.book?.sections ?? []).map((s: { id: string }) => ({ href: s.id }))
    },

    toc() {
      return mapToc(view.book?.toc)
    },

    async goTo(target: string | { index: number; anchor: number }): Promise<boolean> {
      try {
        if (typeof target === 'string') {
          const resolved = view.resolveNavigation(target)
          if (!resolved) return false
          const res = await view.goTo(target)
          return !!res
        }
        const count: number = view.book?.sections?.length ?? 0
        if (!Number.isInteger(target.index) || target.index < 0 || target.index >= count) return false
        await view.renderer.goTo({ index: target.index, anchor: target.anchor })
        return true
      } catch {
        return false
      }
    },

    async goToFraction(f: number): Promise<void> {
      await view.goToFraction(Math.min(1, Math.max(0, f)))
    },

    async textAt(cfi: string): Promise<string | null> {
      try {
        const { index, anchor } = view.resolveNavigation(cfi)
        const doc: Document = await view.book.sections[index].createDocument()
        const range: Range | undefined = anchor(doc)
        return range?.toString() ?? null
      } catch {
        return null
      }
    },

    async findInSection(index: number, keys: string[], nearFraction: number): Promise<string | null> {
      if (keys.length === 0) return null
      try {
        const doc: Document = await view.book.sections[index].createDocument()
        const textIndex = buildTextIndex(doc.body)
        const found = findNearest(textIndex, keys, nearFraction)
        if (found === null) return null
        const { node, offset } = textIndex.map[found]
        const range = doc.createRange()
        range.setStart(node, offset)
        range.collapse(true)
        return view.getCFI(index, range) as string
      } catch {
        return null
      }
    },

    next(): Promise<void> {
      return view.next()
    },

    prev(): Promise<void> {
      return view.prev()
    },

    setPrefs(css: string): void {
      view.renderer?.setStyles?.(css)
    },

    onRelocate(cb: RelocateCallback): () => void {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },

    destroy(): void {
      releaseBlobTransform?.()
      releaseBlobTransform = null
      view.close?.()
      view.remove()
      subscribers.clear()
    },
  }
}
