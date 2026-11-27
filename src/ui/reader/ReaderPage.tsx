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
import { goBack } from '../../router'
import { buildAnchor, planRestore, type Anchor, type RelocateInfo } from '../../progress/anchor'
import { getProgress, saveProgress } from '../../progress/progress-repo'
import { createSaveScheduler } from '../../progress/save-scheduler'
import { Icon, IconButton } from '../icons/Icon'
import { useBackClose } from '../useBackClose'
import { ProgressBar } from '../ProgressBar'
import { ReaderChrome } from './ReaderChrome'
import { TocPanel, type TocEntry } from './TocPanel'
import { startMediaKeys, type MediaKeys } from '../../reader/media-keys'
import { PrefsSheet } from './PrefsSheet'
import { startWakeLock } from '../../reader/wake-lock'

export interface ReaderDeps {
  db: AppDB
  cacheDeps: CacheDeps
  createAdapter?: (
    container: HTMLElement,
    opts?: { onSectionLoad?: (doc: Document, index: number) => void },
  ) => Promise<ReaderAdapter>
  getFile?: typeof getBookFile
  onNotice?: (text: string) => void
  /** Default: goBack('#/') */
  onBack?: () => void
}

type View =
  | { kind: 'loading'; percent?: number | null }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: 'offline' | 'network' | 'quota' }

type Sheet = null | 'toc' | 'prefs'

const HINT_KEY = 'reader.tapHintSeen'
/** Set while the reader has hidden the TOC side panel on wide screens. */
const TOC_HIDDEN_KEY = 'reader.tocHidden'
/** How long the controls stay up after the book opens, before they fade out. */
const CHROME_INTRO_MS = 3500

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return true
  }
}

function tocHidden(): boolean {
  try {
    return localStorage.getItem(TOC_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

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
  const mediaRef = useRef<MediaKeys | null>(null)
  const prefsRef = useRef<ReaderPrefs>(DEFAULT_PREFS)
  prefsRef.current = prefs
  const [chrome, setChrome] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [tocOpen, setTocOpen] = useState(() => !tocHidden())
  const [hint, setHint] = useState(false)
  const introTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useBackClose(sheet !== null, () => setSheet(null))

  // Once the book is ready, show the controls for a moment so the way back is visible,
  // and on the very first book explain the tap zones.
  useEffect(() => {
    if (view.kind !== 'ready') return
    setChrome(true)
    if (!hintSeen()) setHint(true)
    introTimer.current = setTimeout(() => setChrome(false), CHROME_INTRO_MS)
    return () => clearTimeout(introTimer.current)
  }, [view.kind])

  // Media-session page turning (headset / remote / lock screen buttons). Needs a gesture to
  // start playing, so arm on the first tap anywhere; reader taps inside the book arm it too.
  useEffect(() => {
    if (view.kind !== 'ready' || !prefs.mediaKeys) return
    const mk = startMediaKeys({
      title,
      onPrev: () => void adapterRef.current?.prev(),
      onNext: () => void adapterRef.current?.next(),
    })
    if (!mk) return
    mediaRef.current = mk
    const arm = (): void => mk.arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      mk.stop()
      mediaRef.current = null
    }
  }, [view.kind, prefs.mediaKeys, title])

  // Keep the screen awake while a book is open.
  useEffect(() => {
    if (view.kind !== 'ready') return
    return startWakeLock()
  }, [view.kind])

  const dismissHint = (): void => {
    setHint(false)
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      // Storage unavailable: the hint shows again next time.
    }
  }

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
      mediaRef.current?.arm()
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
      else {
        clearTimeout(introTimer.current)
        setChrome((c) => !c)
      }
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
      try {
        await a.open(file)
      } catch (err) {
        if (cancelled) return
        // The stored copy cannot be parsed (corrupt or truncated download). Drop it so that
        // retrying downloads a fresh copy instead of failing on the same bytes forever.
        console.warn('[reader] cached file unreadable, discarding it', err)
        await db.bookFiles.delete(id)
        a.destroy()
        adapter = null
        adapterRef.current = null
        setView({ kind: 'error', error: 'network' })
        return
      }
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

  const toggleToc = (open: boolean): void => {
    // The controls were just used: do not let the intro timer pull them away.
    clearTimeout(introTimer.current)
    setTocOpen(open)
    try {
      if (open) localStorage.removeItem(TOC_HIDDEN_KEY)
      else localStorage.setItem(TOC_HIDDEN_KEY, '1')
    } catch {
      // Storage unavailable: the choice lasts until the book is closed.
    }
  }

  const back = (): void => {
    if (p.onBack) p.onBack()
    else goBack('#/')
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
    <div class="fixed inset-0 flex select-none [-webkit-touch-callout:none] bg-[var(--reader-bg)] text-[var(--reader-fg)]" style={cssVars}>
      {tocOpen && (
        <aside
          aria-label="Mục lục"
          class="hidden w-80 shrink-0 flex-col border-e border-current/10 lg:flex"
        >
          <TocPanel
            variant="panel"
            toc={toc}
            onSelect={goTo}
            onClose={() => toggleToc(false)}
            disabled={view.kind !== 'ready'}
          />
        </aside>
      )}

      <div ref={containerRef} class="relative flex-1 min-h-dvh">
        {view.kind === 'loading' && (
          <div
            role="status"
            class="absolute inset-0 z-10 flex items-center justify-center bg-[var(--reader-bg)] p-gutter"
          >
            <div class="w-full max-w-xs">
              {/* undefined = no chunk yet (0 %); null = size unknown (indeterminate). */}
              <ProgressBar percent={view.percent === undefined ? 0 : view.percent} />
            </div>
          </div>
        )}

        {view.kind === 'not-found' && (
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--reader-bg)] p-gutter text-center">
            <Icon name="cloud-off" class="size-10 opacity-60" />
            <p class="font-serif text-fluid-lg font-semibold">Không tìm thấy truyện</p>
            <p class="max-w-xs text-fluid-sm opacity-75">Truyện có thể đã bị gỡ khỏi máy chủ.</p>
            <a
              href="#/"
              class="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-fluid-sm font-medium text-on-accent"
            >
              Về thư viện
            </a>
          </div>
        )}

        {view.kind === 'error' && (
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--reader-bg)] p-gutter text-center">
            {view.error === 'offline' && (
              <>
                <Icon name="cloud-off" class="size-10 opacity-60" />
                <p class="text-fluid-base">Cần kết nối mạng để tải truyện này lần đầu</p>
                <p class="max-w-xs text-fluid-sm opacity-75">Kết nối mạng rồi mở lại, hoặc chọn một truyện đã lưu.</p>
              </>
            )}
            {view.error === 'network' && (
              <>
                <p class="text-fluid-base">Không tải được truyện</p>
                <p class="text-fluid-sm opacity-70">Không tải được truyện, thử lại sau</p>
                <IconButton icon="retry" label="Thử lại" variant="primary" onClick={() => setAttempt((n) => n + 1)} />
              </>
            )}
            {view.error === 'quota' && (
              <>
                <p class="text-fluid-base">Bộ nhớ đầy — hãy xoá bớt truyện đã lưu</p>
                <a
                  href="#/settings"
                  class="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-fluid-sm font-medium text-on-accent"
                >
                  Mở Cài đặt
                </a>
              </>
            )}
          </div>
        )}

        {!showChrome && (
          <button
            type="button"
            aria-label="Về thư viện"
            title="Về thư viện"
            onClick={back}
            class="absolute start-2 top-[max(0.5rem,env(safe-area-inset-top))] z-20 inline-flex size-11 cursor-pointer items-center justify-center rounded-full opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          >
            <Icon name="back" />
          </button>
        )}

        {hint && view.kind === 'ready' && (
          <button
            type="button"
            aria-label="Đã hiểu cách lật trang"
            onClick={dismissHint}
            class="absolute inset-0 z-30 grid cursor-pointer grid-cols-[3fr_4fr_3fr] bg-black/60 text-center text-fluid-sm font-medium text-white"
          >
            <span class="flex items-center justify-center border-e border-dashed border-white/40 p-2">← Trang trước</span>
            <span class="flex flex-col items-center justify-center gap-1 p-2">
              <span>Chạm giữa để mở menu</span>
              <span class="opacity-75">(chạm để bắt đầu đọc)</span>
            </span>
            <span class="flex items-center justify-center border-s border-dashed border-white/40 p-2">Trang sau →</span>
          </button>
        )}

        {showChrome && (
          <ReaderChrome
            title={title}
            sectionLabel={loc.label}
            fraction={loc.fraction}
            onBack={back}
            onToc={() => setSheet('toc')}
            tocOpen={tocOpen}
            onToggleToc={() => toggleToc(!tocOpen)}
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
