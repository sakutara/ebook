import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { AppDB, Book, BookFile, Progress } from '../../db/db'
import type { Services } from '../../services'
import { catalogStatus, type CatalogStatus } from '../../catalog/catalog-sync'
import { syncStatus } from '../../sync/sync-engine'
import { navigate } from '../../router'
import { getBookFile, CacheError } from '../../cache/book-cache'
import { showToast } from '../toast-store'
import { useLiveQuery } from '../useLiveQuery'
import { IconButton, IconTextButton } from '../icons/Icon'
import { BookCard } from './BookCard'
import { buildCards, type CardModel } from './library-model'
import { filter, query } from './library-state'
import { SearchBar } from './SearchBar'
import { useIncrementalList } from './useIncrementalList'

export interface LibraryPageProps {
  services: Pick<Services, 'db' | 'api' | 'config' | 'catalogSync' | 'coverService'>
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
  return 'Không tải được truyện'
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

/** Saves a cached blob through an object URL, using the Drive file name. */
function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function LibraryPage({ services }: LibraryPageProps) {
  const { db, api, config, catalogSync, coverService } = services

  // `undefined` means "not delivered yet": the grid waits for all three queries.
  const books = useLiveQuery<Book[] | undefined>(() => db.books.orderBy('normTitle').toArray(), [db], undefined)
  const files = useLiveQuery<FileMeta[] | undefined>(() => loadFiles(db), [db], undefined)
  const progress = useLiveQuery<ProgressMeta[] | undefined>(() => loadProgress(db), [db], undefined)
  const loaded = books !== undefined && files !== undefined && progress !== undefined

  const q = query.value
  const f = filter.value
  const online = syncStatus.value.online
  const status = catalogStatus.value

  // Nothing is listed until all three queries have delivered, so no card renders without its badges.
  const catalogCards = useMemo(
    () => (loaded ? buildCards(books ?? [], files ?? [], progress ?? [], '', 'all') : []),
    [loaded, books, files, progress],
  )
  const cards = useMemo(
    () => (loaded ? buildCards(books ?? [], files ?? [], progress ?? [], q, f) : []),
    [loaded, books, files, progress, q, f],
  )
  const { visible, sentinelRef, hasMore } = useIncrementalList(cards, 40, '600px')

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

  // Percent per book id while its file is being fetched into the cache before reading.
  const [preparing, setPreparing] = useState<Record<string, number>>({})
  const setPct = (id: string, pct: number | null) =>
    setPreparing((m) => {
      const { [id]: _drop, ...rest } = m
      return pct === null ? rest : { ...rest, [id]: pct }
    })

  const openReader = (id: string) => navigate(`#/read/${encodeURIComponent(id)}`)

  // Reading needs the file in the cache first: download it, then open the reader.
  const onRead = async (card: CardModel) => {
    const id = card.book.id
    if (card.cached || preparing[id] !== undefined) {
      if (card.cached) openReader(id)
      return
    }
    setPct(id, 0)
    try {
      await getBookFile({ db, api }, id, { onProgress: (pct) => setPct(id, pct) })
      openReader(id)
    } catch (e) {
      showToast(cacheErrorText(e))
    } finally {
      setPct(id, null)
    }
  }

  const onDownload = async (card: CardModel) => {
    const { book } = card
    if (preparing[book.id] !== undefined) return
    const useLocal = card.cached && (!card.stale || !syncStatus.value.online || card.localOnly)
    if (useLocal) {
      const row = await db.bookFiles.get(book.id)
      if (row) {
        saveBlob(row.blob, book.name)
        return
      }
    }
    if (!api || !syncStatus.value.online) {
      location.assign(
        api?.downloadUrl(book.id) ?? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(book.id)}`,
      )
      return
    }
    // Uncached or stale: fetch into the cache once, then save that same copy to the device.
    setPct(book.id, 0)
    try {
      const res = await getBookFile({ db, api }, book.id, { onProgress: (pct) => setPct(book.id, pct) })
      saveBlob(res.blob, book.name)
    } catch (e) {
      showToast(cacheErrorText(e))
    } finally {
      setPct(book.id, null)
    }
  }

  const line = statusLine(status)

  return (
    <section class="flex flex-col gap-3 py-3">
      <div class="flex items-center gap-2">
        <SearchBar />
      </div>

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

      {!config && <p role="note" class="text-fluid-sm text-ink-muted">Chưa cấu hình thư mục Google Drive</p>}

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
            online={online}
            getCover={(b) => coverService.get(b)}
            showCover={f === 'saved' && card.cached}
            preparing={preparing[card.book.id]}
            onRead={() => void onRead(card)}
            onDownload={(c) => void onDownload(c)}
          />
        ))}
      </div>

      {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
    </section>
  )
}
