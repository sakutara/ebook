import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { AppDB, Book, BookFile, Progress } from '../../db/db'
import type { Services } from '../../services'
import { catalogStatus, type CatalogStatus } from '../../catalog/catalog-sync'
import { syncStatus } from '../../sync/sync-engine'
import { navigate, route } from '../../router'
import { getBookFile, CacheError } from '../../cache/book-cache'
import { isSlug } from '../../domain/slug'
import { epubFileName } from '../../domain/file-name'
import { showToast } from '../toast-store'
import { useLiveQuery } from '../useLiveQuery'
import { Icon, IconButton } from '../icons/Icon'
import { removeSavedCopy } from '../cache-actions'
import { BookCard } from './BookCard'
import { BookSheet } from './BookSheet'
import { CoverImage } from './CoverImage'
import { authorOptions, buildCards, genreOptions, splitRecent, type CardModel } from './library-model'
import { author, clearFilters, filter, genre, query, sort } from './library-state'
import { FilterPanel } from './FilterPanel'
import { SearchBar } from './SearchBar'
import { useIncrementalList } from './useIncrementalList'

export interface LibraryPageProps {
  services: Pick<Services, 'db' | 'source' | 'config' | 'catalogSync'>
}

type FileMeta = Pick<BookFile, 'bookId' | 'md5' | 'modifiedTime'>
type ProgressMeta = Pick<Progress, 'bookId' | 'fraction' | 'deleted' | 'updatedAt'>

const SCROLL_KEY = 'library.scrollY'
/** Book last opened from the library; the grid scrolls it into view on return. */
const LAST_KEY = 'library.lastOpened'
/** Books read past this fraction count as finished and leave the "Đọc tiếp" row. */
const FINISHED = 0.99
const GRID = 'grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]'

/** Link that reopens this book's popup in the web app. */
export function bookShareUrl(id: string): string {
  const u = new URL(location.href)
  u.hash = `#/book/${encodeURIComponent(id)}`
  u.search = ''
  return u.toString()
}

async function shareBook(book: Book): Promise<void> {
  const url = bookShareUrl(book.id)
  const text = book.author !== '' ? `${book.title} — ${book.author}` : book.title
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: book.title, text, url })
      return
    }
    await navigator.clipboard.writeText(url)
    showToast('Đã chép liên kết truyện')
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    showToast('Không thể chia sẻ liên kết')
  }
}

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
    updatedAt: p.updatedAt,
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
  const progress = useLiveQuery<ProgressMeta[] | undefined>(() => loadProgress(db), [db], undefined)
  const files = useLiveQuery<FileMeta[] | undefined>(() => loadFiles(db), [db], undefined)
  const loaded = books !== undefined && files !== undefined && progress !== undefined

  const q = query.value
  const f = filter.value
  const g = genre.value
  const a = author.value
  const s = sort.value
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
        ? buildCards(books ?? [], files ?? [], progress ?? [], { q, saved: f === 'saved', genre: g, author: a, sort: s })
        : [],
    [loaded, books, files, progress, q, f, g, a, s],
  )
  // "Truyện mới" rows only show on the plain library view; searching or filtering lists every match below.
  const showRecentRows = q === '' && g === '' && a === '' && f === 'all'
  const recent = useMemo(
    () => (loaded && showRecentRows ? splitRecent(catalogCards, Date.now()) : { day: [], week: [] }),
    [loaded, showRecentRows, catalogCards],
  )
  const mainCards = useMemo(() => {
    if (recent.day.length === 0 && recent.week.length === 0) return cards
    const hidden = new Set([...recent.day, ...recent.week].map((c) => c.book.id))
    return cards.filter((c) => !hidden.has(c.book.id))
  }, [cards, recent])
  const { visible, sentinelRef, hasMore } = useIncrementalList(mainCards, 40, '600px')

  const cachedIds = useMemo(() => new Set((files ?? []).map((x) => x.bookId)), [files])
  const genres = useMemo(() => genreOptions(books ?? [], cachedIds), [books, cachedIds])
  const authors = useMemo(() => authorOptions(books ?? [], cachedIds), [books, cachedIds])
  // A selection with no matching option counts as "all" (buildCards ignores it the same way).
  const genreValue = genres.some((o) => o.value === g) ? g : ''
  const authorValue = authors.some((o) => o.value === a) ? a : ''
  const hasFilters = q !== '' || g !== '' || a !== ''
  const activeFilters = (f === 'saved' ? 1 : 0) + (genreValue !== '' ? 1 : 0) + (authorValue !== '' ? 1 : 0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Set once the saved scroll position has been restored (see below). Until then the page may be
  // shorter than the saved offset, and the browser's clamped scrollY must not overwrite it.
  const restored = useRef(false)

  // Remember the scroll position while scrolling (throttled to frames). Not written on unmount:
  // by then the reader has replaced the page and the browser has already clamped scrollY.
  // Layout effect so the listener is removed synchronously on unmount.
  useLayoutEffect(() => {
    let frame = 0
    const save = () => {
      frame = 0
      if (!restored.current) return
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
  useLayoutEffect(() => {
    if (restored.current || !loaded) return
    if (visible.length === 0 && catalogCards.length > 0) return
    restored.current = true
    try {
      const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0)
      if (saved > 0) window.scrollTo(0, saved)
      // Make sure the book just read is on screen, whatever the filter rows did to the offset.
      const last = sessionStorage.getItem(LAST_KEY)
      sessionStorage.removeItem(LAST_KEY)
      if (last) {
        const el = document.querySelector(`[data-book-id="${CSS.escape(last)}"]`)
        const rect = el?.getBoundingClientRect()
        if (el && rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
          el.scrollIntoView?.({ block: 'center' })
        }
      }
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

  const openReader = (id: string) => {
    try {
      sessionStorage.setItem(LAST_KEY, id)
    } catch {
      // Storage unavailable: the scroll position alone is restored.
    }
    navigate(`#/read/${encodeURIComponent(id)}`)
  }

  // The action sheet for the tapped cover. Read the card fresh from the list on each render so
  // its badges follow downloads and removals while it is open.
  const [sheetId, setSheetId] = useState<string | null>(null)
  // A shared link (#/book/<id>) opens that book's popup, then leaves the hash at the library.
  const shared = route.value
  useEffect(() => {
    if (shared.name !== 'book') return
    setSheetId(shared.id)
    navigate('#/', { replace: true })
  }, [shared])
  const sheetCard = sheetId === null ? undefined : catalogCards.find((c) => c.book.id === sheetId)

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

  // Started but unfinished books, most recently read first.
  const continueCards = useMemo(() => {
    if (!loaded) return []
    const updated = new Map((progress ?? []).filter((x) => x.deleted === 0).map((x) => [x.bookId, x.updatedAt]))
    return catalogCards
      .filter((c) => c.fraction !== undefined && c.fraction > 0 && c.fraction < FINISHED)
      .sort((x, y) => (updated.get(y.book.id) ?? 0) - (updated.get(x.book.id) ?? 0))
      .slice(0, 12)
  }, [loaded, catalogCards, progress])
  const showContinue = !hasFilters && f === 'all' && continueCards.length > 0

  const line = statusLine(status)
  const syncing = status.state === 'syncing'

  return (
    <section class="py-3 xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start xl:gap-8">
      <div class="flex min-w-0 flex-col gap-4">
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2">
          <SearchBar />
          {config && (
            <IconButton
              icon={status.state === 'error' ? 'retry' : 'refresh'}
              label={status.state === 'error' ? 'Thử lại' : 'Làm mới'}
              disabled={syncing}
              class={syncing ? '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none' : ''}
              onClick={() => void catalogSync.sync({ force: true })}
            />
          )}
          <span class="relative xl:hidden">
            <IconButton
              icon="sliders"
              label="Mở bộ lọc"
              pressed={filtersOpen}
              onClick={() => setFiltersOpen(true)}
            />
            {activeFilters > 0 && (
              <span
                aria-hidden="true"
                class="pointer-events-none absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs font-semibold tabular-nums text-on-accent"
              >
                {activeFilters}
              </span>
            )}
          </span>
        </div>

        {(hasFilters || line) && (
          <div class="flex min-h-6 items-center justify-between gap-2 text-fluid-sm text-ink-muted">
            <span aria-live="polite" class={status.state === 'error' ? 'text-danger' : ''}>
              {hasFilters ? `${cards.length} truyện phù hợp` : line}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                class="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-3 font-medium text-accent hover:bg-surface-2"
              >
                <Icon name="close" class="size-4" />
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {!config && (
        <p role="note" class="card flex items-center gap-2 p-3 text-fluid-sm text-ink-muted">
          <Icon name="cloud-off" class="size-5" />
          Chưa cấu hình máy chủ truyện
        </p>
      )}

      {showContinue && (
        <section aria-labelledby="continue-heading" class="flex flex-col gap-2">
          <h2 id="continue-heading" class="text-fluid-lg font-semibold">
            Đọc tiếp
          </h2>
          <ul class="-mx-gutter flex snap-x gap-3 overflow-x-auto px-gutter pb-1 [scrollbar-width:none]">
            {continueCards.map((c) => (
              <li key={c.book.id} class="w-28 shrink-0 snap-start sm:w-32">
                <button
                  type="button"
                  data-continue
                  aria-label={`Đọc tiếp ${c.book.title}`}
                  disabled={fetching[c.book.id] !== undefined || (!c.cached && !canFetch)}
                  onClick={() => onRead(c)}
                  class="flex w-full cursor-pointer flex-col gap-1.5 text-start disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span class="relative block">
                    <CoverImage book={{ title: c.book.title, normTitle: c.book.normTitle }} src={coverUrlOf(c.book)} />
                    <span class="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-md bg-black/35">
                      <span class="block h-full bg-accent-on-ink" style={{ width: `${Math.round((c.fraction ?? 0) * 100)}%` }} />
                    </span>
                  </span>
                  <span class="line-clamp-1 text-fluid-sm font-medium">{c.book.title}</span>
                  <span class="-mt-1 text-xs tabular-nums text-ink-muted">
                    {fetching[c.book.id] !== undefined
                      ? 'Đang tải…'
                      : (c.fraction ?? 0) < 0.01
                        ? 'Vừa bắt đầu'
                        : `${Math.round((c.fraction ?? 0) * 100)}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {([['recent-day', 'Truyện mới trong ngày', recent.day], ['recent-week', 'Truyện mới trong tuần', recent.week]] as const).map(
        ([id, title, list]) =>
          list.length > 0 && (
            <section key={id} aria-labelledby={`${id}-heading`} class="flex flex-col gap-2">
              <h2 id={`${id}-heading`} class="text-fluid-lg font-semibold">
                {title}
              </h2>
              <ul class="-mx-gutter flex snap-x gap-3 overflow-x-auto px-gutter pb-1 [scrollbar-width:thin]">
                {list.map((c) => (
                  <li key={c.book.id} class="w-28 shrink-0 snap-start sm:w-32" data-recent-item>
                    <button
                      type="button"
                      data-book-id={c.book.id}
                      aria-label={c.book.title}
                      onClick={() => setSheetId(c.book.id)}
                      class="flex w-full cursor-pointer flex-col gap-1.5 text-start"
                    >
                      <CoverImage book={{ title: c.book.title, normTitle: c.book.normTitle }} src={coverUrlOf(c.book)} />
                      <span class="line-clamp-2 text-fluid-sm font-medium">{c.book.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      {(showContinue || recent.day.length > 0 || recent.week.length > 0) && (
        <h2 class="-mb-1 text-fluid-lg font-semibold">Tất cả truyện</h2>
      )}

      {(!loaded || (catalogCards.length === 0 && syncing)) && (
        <div class={GRID} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} class="flex flex-col gap-2">
              <div class="aspect-[2/3] animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
              <div class="h-4 w-3/4 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      )}

      {loaded && catalogCards.length === 0 && !syncing && (
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <Icon name="library" class="size-10 text-ink-muted" />
          <p class="font-serif text-fluid-lg font-semibold">Chưa có truyện nào</p>
          <p class="max-w-xs text-fluid-sm text-ink-muted">
            {config ? 'Thư viện sẽ hiện ở đây sau khi cập nhật từ máy chủ.' : 'Cần cấu hình máy chủ truyện để tải danh sách.'}
          </p>
        </div>
      )}
      {loaded && catalogCards.length > 0 && cards.length === 0 && (
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <Icon name="search" class="size-10 text-ink-muted" />
          <p class="font-serif text-fluid-lg font-semibold">Không tìm thấy truyện nào</p>
          <p class="max-w-xs text-fluid-sm text-ink-muted">
            {f === 'saved' && !hasFilters ? 'Chưa có truyện nào được lưu trên máy.' : 'Thử từ khoá khác hoặc bỏ bớt bộ lọc.'}
          </p>
        </div>
      )}

      <div class={GRID}>
        {visible.map((card) => (
          <BookCard
            key={card.book.id}
            card={card}
            online={canFetch}
            coverUrl={coverUrlOf(card.book)}
            progress={fetching[card.book.id]}
            onOpen={(c) => setSheetId(c.book.id)}
            onCancel={() => onCancel(card.book.id)}
          />
        ))}
      </div>

      {hasMore && <div ref={sentinelRef} aria-hidden="true" />}

      {sheetCard && (
        <BookSheet
          card={sheetCard}
          online={canFetch}
          coverUrl={coverUrlOf(sheetCard.book)}
          onClose={() => setSheetId(null)}
          onShare={() => void shareBook(sheetCard.book)}
          onRead={() => {
            setSheetId(null)
            onRead(sheetCard)
          }}
          onDownload={() => {
            setSheetId(null)
            void onDownload(sheetCard)
          }}
          onRemoveSaved={() => {
            setSheetId(null)
            void removeSavedCopy(db, sheetCard.book.id, sheetCard.book.title)
          }}
        />
      )}
      </div>

      <FilterPanel
        authors={authors}
        authorValue={authorValue}
        genres={genres}
        genreValue={genreValue}
        resultCount={cards.length}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
      />
    </section>
  )
}
