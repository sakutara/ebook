import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { AppDB, Book, BookFile, Progress } from '../../db/db'
import type { Services } from '../../services'
import { catalogStatus, type CatalogStatus } from '../../catalog/catalog-sync'
import { syncStatus } from '../../sync/sync-engine'
import { navigate } from '../../router'
import { getBookFile, CacheError } from '../../cache/book-cache'
import { isSlug } from '../../domain/slug'
import { epubFileName } from '../../domain/file-name'
import { showToast } from '../toast-store'
import { useLiveQuery } from '../useLiveQuery'
import { IconButton, IconTextButton } from '../icons/Icon'
import { BookCard } from './BookCard'
import { authorOptions, buildCards, genreOptions, type CardModel } from './library-model'
import { author, clearFilters, filter, genre, query } from './library-state'
import { SearchBar } from './SearchBar'
import { useIncrementalList } from './useIncrementalList'

export interface LibraryPageProps {
  services: Pick<Services, 'db' | 'source' | 'config' | 'catalogSync'>
}

type FileMeta = Pick<BookFile, 'bookId' | 'md5' | 'modifiedTime'>
type ProgressMeta = Pick<Progress, 'bookId' | 'fraction' | 'deleted'>

const SCROLL_KEY = 'library.scrollY'
const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]'
const FILTERS = [
  { value: 'all', label: 'Tất cả', icon: 'filter-all' },
  { value: 'saved', label: 'Đã lưu', icon: 'filter-saved' },
] as const

function cacheErrorText(e: unknown): string {
  const kind = e instanceof CacheError ? e.kind : 'network'
  if (kind === 'offline') return 'Cần kết nối mạng để tải truyện này lần đầu'
  if (kind === 'quota') return 'Bộ nhớ đầy — hãy xoá bớt truyện đã lưu'
  if (kind === 'not-found') return 'Không tìm thấy truyện'
  return 'Không tải được truyện, thử lại sau'
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

const pad = (n: number) => String(n).padStart(2, '0')

function statusLine(s: CatalogStatus): string | null {
  if (s.state === 'syncing') return 'Đang cập nhật…'
  if (s.state === 'error') return s.error ?? 'Cập nhật thất bại'
  if (s.lastSyncAt) {
    const d = new Date(s.lastSyncAt)
    return `Cập nhật lúc ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return null
}

/** Stores only the metadata needed for cards; blobs never enter component state. */
async function loadFiles(db: AppDB): Promise<FileMeta[]> {
  return (await db.bookFiles.toArray()).map((f) => ({
    bookId: f.bookId,
    md5: f.md5,
    modifiedTime: f.modifiedTime,
  }))
}

async function loadProgress(db: AppDB): Promise<ProgressMeta[]> {
  return (await db.progress.toArray()).map((p) => ({
    bookId: p.bookId,
    fraction: p.fraction,
    deleted: p.deleted,
  }))
}

/** Saves a cached blob through an object URL, using the given file name. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function LibraryPage({ services }: LibraryPageProps) {
  const { db, source, config, catalogSync } = services

  // `undefined` means "not delivered yet": the grid waits for all three queries.
  const books = useLiveQuery<Book[] | undefined>(() => db.books.orderBy('normTitle').toArray(), [db], undefined)
  const files = useLiveQuery<FileMeta[] | undefined>(() => loadFiles(db), [db], undefined)
  const progress = useLiveQuery<ProgressMeta[] | undefined>(() => loadProgress(db), [db], undefined)
  const loaded = books !== undefined && files !== undefined && progress !== undefined

  const q = query.value
  const f = filter.value
  const g = genre.value
  const a = author.value
  const online = syncStatus.value.online
  const status = catalogStatus.value

  // Nothing is listed until all three queries have delivered, so no card renders without its badges.
  const catalogCards = useMemo(
    () =>
      loaded
        ? buildCards(books ?? [], files ?? [], progress ?? [], { q: '', saved: false, genre: '', author: '' })
        : [],
    [loaded, books, files, progress],
  )
  const cards = useMemo(
    () =>
      loaded
        ? buildCards(books ?? [], files ?? [], progress ?? [], { q, saved: f === 'saved', genre: g, author: a })
        : [],
    [loaded, books, files, progress, q, f, g, a],
  )
  const { visible, sentinelRef, hasMore } = useIncrementalList(cards, 40, '600px')

  const cachedIds = useMemo(() => new Set((files ?? []).map((x) => x.bookId)), [files])
  const genres = useMemo(() => genreOptions(books ?? [], cachedIds), [books, cachedIds])
  const authors = useMemo(() => authorOptions(books ?? [], cachedIds), [books, cachedIds])
  // A selection with no matching option counts as "all" (buildCards ignores it the same way).
  const genreValue = genres.some((o) => o.value === g) ? g : ''
  const authorValue = authors.some((o) => o.value === a) ? a : ''
  const hasFilters = q !== '' || g !== '' || a !== ''

  // Remember the scroll position while scrolling (throttled to frames). Not written on unmount:
  // by then the reader has replaced the page and the browser has already clamped scrollY.
  // Layout effect so the listener is removed synchronously on unmount.
  useLayoutEffect(() => {
    let frame = 0
    const save = () => {
      frame = 0
      try {
        sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)))
      } catch {
        // Storage unavailable: nothing to remember.
      }
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(save)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  // Restore once per mount, after the first render that has cards (or the catalog is known empty).
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || !loaded) return
    if (visible.length === 0 && catalogCards.length > 0) return
    restored.current = true
    try {
      const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0)
      if (saved > 0) window.scrollTo(0, saved)
    } catch {
      // Storage or scrolling unavailable: start at the top.
    }
  }, [loaded, visible.length, catalogCards.length])

  // Fetch state per book id: percent while running (null = unknown total). Absent = idle.
  const [fetching, setFetching] = useState<Record<string, number | null>>({})
  const controllers = useRef(new Map<string, AbortController>())

  const setPct = (id: string, pct: number | null) => setFetching((m) => ({ ...m, [id]: pct }))
  const clearFetch = (id: string) =>
    setFetching((m) => {
      const { [id]: _drop, ...rest } = m
      return rest
    })

  /**
   * Fetches one book into the cache with progress, then runs `then` with the stored blob.
   * A second start for the same book while it runs is ignored. Abort stays silent; other failures toast.
   */
  const startFetch = async (book: Book, then: (blob: Blob) => void): Promise<void> => {
    const id = book.id
    if (controllers.current.has(id)) return
    const controller = new AbortController()
    controllers.current.set(id, controller)
    setPct(id, 0)
    try {
      const res = await getBookFile(
        { db, source },
        id,
        {
          // Ignore progress from a request that was already cancelled or replaced.
          onProgress: (pct) => {
            if (controllers.current.get(id) === controller && !controller.signal.aborted) setPct(id, pct)
          },
          signal: controller.signal,
        },
      )
      then(res.blob)
    } catch (e) {
      if (!isAbortError(e)) showToast(cacheErrorText(e))
    } finally {
      controllers.current.delete(id)
      clearFetch(id)
    }
  }

  const onCancel = (id: string) => controllers.current.get(id)?.abort()

  const openReader = (id: string) => navigate(`#/read/${encodeURIComponent(id)}`)

  // Reading needs the file in the cache first: a cached book opens at once, otherwise fetch then open.
  const onRead = (card: CardModel) => {
    const id = card.book.id
    if (card.cached) {
      openReader(id)
      return
    }
    void startFetch(card.book, () => openReader(id))
  }

  const onDownload = async (card: CardModel) => {
    const { book } = card
    if (controllers.current.has(book.id)) return
    // Without a source nothing can be refreshed, so a cached copy is saved as it is.
    const useLocal = card.cached && (!card.stale || !source || !syncStatus.value.online || card.localOnly)
    if (useLocal) {
      const row = await db.bookFiles.get(book.id)
      if (row) {
        saveBlob(row.blob, epubFileName(book.title))
        return
      }
    }
    // Offline or unconfigured and not cached: there is nothing to fetch.
    if (!source || !syncStatus.value.online) return
    // Uncached or stale: fetch into the cache once, then save that same copy to the device.
    void startFetch(book, (blob) => saveBlob(blob, epubFileName(book.title)))
  }

  // Without a source a book cannot be fetched, so the card treats the device as offline.
  const canFetch = online && source !== null
  const coverUrlOf = (b: Book): string | undefined =>
    source && b.inDrive === 1 && isSlug(b.id) ? source.coverUrl(b) : undefined

  const genreChips = [
    { value: '', text: 'Tất cả thể loại' },
    ...genres.map((o) => ({ value: o.value, text: `${o.label} ${o.count}` })),
  ]

  const line = statusLine(status)

  return (
    <section class="flex flex-col gap-3 py-3">
      <div class="flex items-center gap-2">
        <SearchBar />
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div role="radiogroup" aria-label="Bộ lọc" class="flex gap-2">
            {FILTERS.map((o) => {
              const on = f === o.value
              return (
                <IconTextButton
                  key={o.value}
                  role="radio"
                  checked={on}
                  icon={o.icon}
                  label={o.label}
                  variant={on ? 'primary' : 'plain'}
                  onClick={() => {
                    filter.value = o.value
                  }}
                />
              )
            })}
          </div>

          <div class="flex items-center gap-1">
            {line && <span aria-live="polite" class="text-fluid-sm text-ink-muted">{line}</span>}
            {status.state === 'error' && (
              <IconButton icon="retry" label="Thử lại" onClick={() => void catalogSync.sync({ force: true })} />
            )}
            {config && (
              <IconButton
                icon="refresh"
                label="Làm mới"
                disabled={status.state === 'syncing'}
                onClick={() => void catalogSync.sync({ force: true })}
              />
            )}
          </div>
        </div>

        <div class="flex flex-col gap-3 md:flex-row md:items-start">
          <div
            role="radiogroup"
            aria-label="Thể loại"
            class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:min-w-0 md:flex-1 md:flex-wrap md:overflow-visible md:px-0"
          >
            {genreChips.map((chip) => {
              const on = genreValue === chip.value
              return (
                <button
                  key={chip.value || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    genre.value = chip.value
                  }}
                  class={`min-h-11 shrink-0 rounded-full px-3 text-fluid-sm ${on ? 'bg-accent text-white' : 'bg-surface-2 text-ink'}`}
                >
                  {chip.text}
                </button>
              )
            })}
          </div>

          <select
            aria-label="Tác giả"
            value={authorValue}
            onChange={(e) => {
              author.value = (e.currentTarget as HTMLSelectElement).value
            }}
            class="min-h-11 w-full rounded-lg bg-surface-2 px-3 text-fluid-base text-ink md:w-56 md:shrink-0"
          >
            <option value="">Tất cả tác giả</option>
            {authors.map((o) => (
              <option key={o.value} value={o.value}>
                {`${o.label} (${o.count})`}
              </option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            class="min-h-11 shrink-0 rounded-xl px-3 text-fluid-sm text-accent hover:underline"
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {!config && <p role="note" class="text-fluid-sm text-ink-muted">Chưa cấu hình máy chủ truyện</p>}

      {(!loaded || (catalogCards.length === 0 && status.state === 'syncing')) && (
        <div class={GRID} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} class="flex flex-col gap-2">
              <div class="aspect-[2/3] animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      )}

      {loaded && catalogCards.length === 0 && status.state !== 'syncing' && (
        <p class="py-8 text-center text-fluid-base text-ink-muted">Chưa có truyện nào</p>
      )}
      {loaded && catalogCards.length > 0 && cards.length === 0 && (
        <p class="py-8 text-center text-fluid-base text-ink-muted">Không tìm thấy truyện nào</p>
      )}

      <div class={GRID}>
        {visible.map((card) => (
          <BookCard
            key={card.book.id}
            card={card}
            online={canFetch}
            coverUrl={coverUrlOf(card.book)}
            progress={fetching[card.book.id]}
            onRead={() => onRead(card)}
            onDownload={(c) => void onDownload(c)}
            onCancel={() => onCancel(card.book.id)}
          />
        ))}
      </div>

      {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
    </section>
  )
}
