import { useEffect, useRef, useState } from 'preact/hooks'
import type { AppDB } from '../../db/db'
import { CacheError, getBookFile, type CacheDeps, type GetResult } from '../../cache/book-cache'
import { createFoliateAdapter } from '../../reader/foliate-adapter'
import type { ReaderAdapter } from '../../reader/adapter'
import {
  clampPrefs,
  DEFAULT_PREFS,
  loadPrefs,
  prefsCss,
  savePrefs,
  THEMES,
  type ReaderPrefs,
} from '../../reader/prefs'
import { restorePosition } from '../../reader/restore'
import { buildAnchor, planRestore, type Anchor, type RelocateInfo } from '../../progress/anchor'
import { getProgress, saveProgress } from '../../progress/progress-repo'
import { createSaveScheduler } from '../../progress/save-scheduler'
import { IconButton } from '../icons/Icon'
import { LoadingOverlay } from './LoadingOverlay'
import { ReaderChrome } from './ReaderChrome'
import { TocPanel, type TocEntry } from './TocPanel'
import { PrefsSheet } from './PrefsSheet'

export interface ReaderDeps {
  db: AppDB
  cacheDeps: CacheDeps
  createAdapter?: (
    container: HTMLElement,
    opts?: { onSectionLoad?: (doc: Document, index: number) => void },
  ) => Promise<ReaderAdapter>
  getFile?: typeof getBookFile
  onNotice?: (text: string) => void
  /** Default: location.hash = '#/' */
  onBack?: () => void
}

type View =
  | { kind: 'loading'; percent?: number }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: 'offline' | 'network' | 'quota' }

type Sheet = null | 'toc' | 'prefs'

// Focused controls keep their own keys (range arrows, Space on a button).
const CONTROL_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']

function isControl(target: EventTarget | null): boolean {
  return !!target && CONTROL_TAGS.includes((target as Element).tagName ?? '')
}

export function ReaderPage(p: { id: string } & ReaderDeps) {
  const { id, db, cacheDeps, onNotice } = p
  const createAdapter = p.createAdapter ?? createFoliateAdapter
  const getFile = p.getFile ?? getBookFile

  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<ReaderAdapter | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [title, setTitle] = useState('')
  const [toc, setToc] = useState<TocEntry[]>([])
  const [loc, setLoc] = useState<{ fraction: number; label: string }>({ fraction: 0, label: '' })
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS)
  const [chrome, setChrome] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)

  // Keyed on the book id and the retry counter only. Other deps (db, getFile, ...)
  // are read once per load so that parent re-renders do not reload the book.
  useEffect(() => {
    let cancelled = false
    let adapter: ReaderAdapter | null = null
    let unsubscribe: (() => void) | null = null
    const scheduler = createSaveScheduler<Anchor>(async (a) => {
      await saveProgress(db, a)
    }, 1000)

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSheet(null)
        return
      }
      const a = adapterRef.current
      if (!a || isControl(e.target)) return
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          void a.prev()
          break
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          void a.next()
          break
      }
    }

    const onSectionClick = (doc: Document, e: MouseEvent): void => {
      const a = adapterRef.current
      if (!a) return
      if ((e.target as Element | null)?.closest?.('a[href]')) return
      if ((doc.getSelection?.()?.toString() ?? '') !== '') return
      // foliate sizes the section iframe to every column, so its own innerWidth is wider than
      // the visible text area. Measure the tap against the visible area instead; fall back to
      // the section window only when the text area has no layout (no rendering engine).
      const area = containerRef.current?.getBoundingClientRect()
      let x: number
      let w: number
      if (area && area.width > 0) {
        const frameLeft = doc.defaultView?.frameElement?.getBoundingClientRect().left ?? 0
        x = frameLeft + e.clientX - area.left
        w = area.width
      } else {
        x = e.clientX
        w = doc.defaultView?.innerWidth ?? 1
      }
      if (x < w * 0.3) void a.prev()
      else if (x > w * 0.7) void a.next()
      else setChrome((c) => !c)
    }

    const onSectionLoad = (doc: Document): void => {
      doc.addEventListener('click', (e) => onSectionClick(doc, e as MouseEvent))
      doc.addEventListener('keydown', onKey)
    }

    const onPageHide = (): void => {
      void scheduler.flush()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') void scheduler.flush()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)

    const run = async (): Promise<void> => {
      const [book, fileRow] = await Promise.all([db.books.get(id), db.bookFiles.get(id)])
      if (cancelled) return
      if (!book && !fileRow) {
        setView({ kind: 'not-found' })
        return
      }
      setTitle(book?.title ?? '')
      setView({ kind: 'loading' })

      let res: GetResult
      try {
        res = await getFile(cacheDeps, id, {
          onProgress: (pct) => {
            if (!cancelled) setView({ kind: 'loading', percent: pct })
          },
        })
      } catch (e) {
        if (cancelled) return
        if (e instanceof CacheError) {
          if (e.kind === 'not-found') setView({ kind: 'not-found' })
          else setView({ kind: 'error', error: e.kind })
        } else {
          // Unknown failure: offered as a retryable network error (see report).
          setView({ kind: 'error', error: 'network' })
        }
        return
      }
      if (cancelled) return
      if (res.usedOld) onNotice?.('Đang đọc bản cũ — sẽ cập nhật khi có mạng')

      const container = containerRef.current
      if (!container) return
      const file = new File([res.blob], book?.name ?? 'book.epub', { type: 'application/epub+zip' })
      const a = await createAdapter(container, { onSectionLoad })
      adapter = a
      adapterRef.current = a
      if (cancelled) return
      await a.open(file)
      if (cancelled) return
      const loaded = await loadPrefs(db)
      a.setPrefs(prefsCss(loaded))
      setPrefs(loaded)
      setToc(a.toc())

      const normTitle = book?.normTitle ?? ''
      const last: { anchor: Anchor | null } = { anchor: null }
      let saveNow = false
      unsubscribe = a.onRelocate((info: RelocateInfo & { tocLabel?: string }) => {
        setLoc({ fraction: info.fraction, label: info.tocLabel ?? '' })
        const anchor = buildAnchor(info, { id, normTitle }, res.md5)
        last.anchor = anchor
        if (saveNow) {
          saveNow = false
          scheduler.push(anchor)
          void scheduler.flush()
        } else {
          scheduler.push(anchor)
        }
      })

      const progress = await getProgress(db, id)
      const kind = await restorePosition(a, planRestore(progress, res.md5))
      if (cancelled) return
      // A non-exact restore means the saved anchor belongs to an older version: store
      // the new position right away instead of waiting for the debounce.
      if (kind !== 'cfi' && kind !== 'start') {
        if (last.anchor) {
          scheduler.push(last.anchor)
          await scheduler.flush()
        } else {
          saveNow = true
        }
      }
      setView({ kind: 'ready' })
    }

    run().catch((err: unknown) => {
      if (cancelled) return
      console.warn('[reader] open failed', err)
      setView({ kind: 'error', error: 'network' })
    })

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      void scheduler.flush()
      unsubscribe?.()
      adapter?.destroy()
      adapterRef.current = null
    }
  }, [id, attempt])

  const back = (): void => {
    if (p.onBack) p.onBack()
    else location.hash = '#/'
  }

  const changePrefs = async (next: ReaderPrefs): Promise<void> => {
    const clean = clampPrefs(next)
    await savePrefs(db, clean)
    adapterRef.current?.setPrefs(prefsCss(clean))
    setPrefs(clean)
  }

  const seek = (fraction: number): void => {
    void adapterRef.current?.goToFraction(fraction)
  }

  const theme = THEMES[prefs.theme]
  const cssVars = { '--reader-bg': theme.bg, '--reader-fg': theme.fg } as unknown as Record<string, string>
  const showChrome = chrome || view.kind !== 'ready'
  const goTo = (href: string): void => {
    void adapterRef.current?.goTo(href)
  }

  return (
    <div class="fixed inset-0 flex bg-[var(--reader-bg)] text-[var(--reader-fg)]" style={cssVars}>
      <aside
        aria-label="Mục lục"
        class="hidden w-80 shrink-0 overflow-y-auto border-e border-black/10 p-gutter lg:block"
      >
        <TocPanel variant="panel" toc={toc} onSelect={goTo} disabled={view.kind !== 'ready'} />
      </aside>

      <div ref={containerRef} class="relative flex-1 min-h-dvh">
        {view.kind === 'loading' && <LoadingOverlay percent={view.percent} />}

        {view.kind === 'not-found' && (
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--reader-bg)] p-gutter text-center">
            <p class="text-fluid-lg">Không tìm thấy truyện</p>
            <a
              href="#/"
              class="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-fluid-sm text-surface"
            >
              Về thư viện
            </a>
          </div>
        )}

        {view.kind === 'error' && (
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--reader-bg)] p-gutter text-center">
            {view.error === 'offline' && (
              <p class="text-fluid-base">Cần kết nối mạng để tải truyện này lần đầu</p>
            )}
            {view.error === 'network' && (
              <>
                <p class="text-fluid-base">Không tải được truyện</p>
                <IconButton icon="retry" label="Thử lại" onClick={() => setAttempt((n) => n + 1)} />
              </>
            )}
            {view.error === 'quota' && (
              <>
                <p class="text-fluid-base">Bộ nhớ đầy — hãy xoá bớt truyện đã lưu</p>
                <a
                  href="#/settings"
                  class="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-fluid-sm text-surface"
                >
                  Mở Cài đặt
                </a>
              </>
            )}
          </div>
        )}

        {showChrome && (
          <ReaderChrome
            title={title}
            sectionLabel={loc.label}
            fraction={loc.fraction}
            onBack={back}
            onToc={() => setSheet('toc')}
            onPrefs={() => setSheet('prefs')}
            onSeek={seek}
          />
        )}
      </div>

      {sheet === 'toc' && (
        <TocPanel
          variant="sheet"
          toc={toc}
          onSelect={goTo}
          onClose={() => setSheet(null)}
          disabled={view.kind !== 'ready'}
        />
      )}
      {sheet === 'prefs' && (
        <PrefsSheet prefs={prefs} onChange={(next) => void changePrefs(next)} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}
