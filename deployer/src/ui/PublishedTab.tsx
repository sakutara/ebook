import { useState } from 'preact/hooks'
import { normalize } from '../../../src/domain/title'
import { IconTextButton } from '../../../src/ui/icons/Icon'
import type { Metadata } from '../types'
import { EditBookDialog } from './EditBookDialog'
import { defaultStore, type DeployerStore } from './store-ref'

export interface PublishedTabProps {
  store?: DeployerStore
}

const MB_BYTES = 1048576
const MB_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 }

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Lỗi không xác định'
}

function formatMb(bytes: number): string {
  return `${(bytes / MB_BYTES).toLocaleString('vi-VN', MB_FORMAT)} MB`
}

/** Catalog books with search, per-book delete (confirmed) and the catalog rebuild. */
export function PublishedTab({ store = defaultStore }: PublishedTabProps) {
  const connected = store.conn.value.state === 'ok'
  const base = store.conn.value.baseUrl.replace(/\/+$/, '')
  const books = store.catalog.value
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'title' | 'recent' | 'size'>('title')
  const [genreFilter, setGenreFilter] = useState('')
  const [pending, setPending] = useState<Metadata | null>(null)
  const [editing, setEditing] = useState<Metadata | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = normalize(query)
  const genres = [...new Set(books.flatMap((b) => b.genres))].sort((a, b) => a.localeCompare(b, 'vi'))
  const shown = books
    .filter((b) => q === '' || normalize(b.title).includes(q) || normalize(b.author).includes(q))
    .filter((b) => genreFilter === '' || b.genres.includes(genreFilter))
    .sort((a, b) =>
      sort === 'size'
        ? b.size - a.size
        : sort === 'recent'
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.title.localeCompare(b.title, 'vi'),
    )

  async function confirmDelete(book: Metadata) {
    setPending(null)
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await store.deleteBook(book.id)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    setBusy(true)
    setError(null)
    setNotice(null)
    setProgress(null)
    try {
      await store.rebuildCatalog((done, total) => setProgress({ done, total }))
      setNotice(`Đã dựng lại catalog · ${store.catalog.value.length} truyện`)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="published-heading" class="grid gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 id="published-heading" class="font-serif text-fluid-lg font-semibold">
          {`Đã đăng · ${books.length} truyện`}
        </h2>
        <IconTextButton
          icon="refresh"
          label="Dựng lại catalog"
          disabled={!connected || busy}
          onClick={() => void rebuild()}
        />
      </div>

      {!connected && <p class="text-fluid-sm text-ink-muted">Hãy kết nối trước</p>}
      {busy && (
        <p class="text-fluid-sm text-ink-muted">
          {progress === null ? 'Đang đọc…' : `Đang đọc ${progress.done}/${progress.total}…`}
        </p>
      )}
      {notice !== null && <p role="status" class="text-fluid-sm text-ink">{notice}</p>}
      {error !== null && <p role="alert" class="rounded-lg bg-danger-soft px-3 py-2 text-fluid-sm text-danger">{`Lỗi: ${error}`}</p>}

      <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div class="grid gap-1 text-fluid-sm">
          <label for="published-search">Tìm truyện đã đăng</label>
          <input
            id="published-search"
            type="search"
            class="field text-fluid-base"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for="published-genre">Thể loại</label>
          <select id="published-genre" class="field text-fluid-base" value={genreFilter} onChange={(e) => setGenreFilter(e.currentTarget.value)}>
            <option value="">Tất cả</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div class="grid gap-1 text-fluid-sm">
          <label for="published-sort">Sắp xếp</label>
          <select
            id="published-sort"
            class="field text-fluid-base"
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as 'title' | 'recent' | 'size')}
          >
            <option value="title">Tên A–Z</option>
            <option value="recent">Mới cập nhật</option>
            <option value="size">Dung lượng lớn</option>
          </select>
        </div>
      </div>
      {(q !== '' || genreFilter !== '') && (
        <p class="text-fluid-sm text-ink-muted">{`${shown.length} / ${books.length} truyện`}</p>
      )}

      <ul class="grid gap-3">
        {shown.map((book) => (
          <li key={book.id} class="card flex items-start gap-3 p-3 transition-colors duration-150 hover:border-ink-muted">
            <img
              src={`${base}/books/${book.id}/cover.jpg?v=${book.md5}`}
              alt=""
              loading="lazy"
              class="h-24 w-16 shrink-0 rounded-md bg-surface object-cover shadow-cover ring-1 ring-black/5"
            />
            <div class="grid min-w-0 flex-1 gap-1">
              <p class="truncate font-serif text-fluid-base font-semibold">{book.title}</p>
              <p class="truncate text-fluid-sm text-ink-muted">{book.author}</p>
              {book.genres.length > 0 && <p class="text-fluid-sm text-ink-muted">{book.genres.join(', ')}</p>}
              <p class="text-fluid-sm tabular-nums text-ink-muted">{formatMb(book.size)}</p>
            </div>
            <div class="flex shrink-0 flex-col gap-1">
              <IconTextButton icon="update" label="Sửa" disabled={!connected || busy} onClick={() => setEditing(book)} />
              <IconTextButton
                icon="trash"
                label="Xoá"
                variant="danger"
                disabled={!connected || busy}
                onClick={() => setPending(book)}
              />
            </div>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <EditBookDialog
          key={editing.id}
          book={editing}
          onCancel={() => setEditing(null)}
          onSave={async (patch) => {
            await store.updateBook(editing.id, patch)
            setEditing(null)
            setNotice(`Đã cập nhật «${patch.title.trim()}»`)
          }}
        />
      )}

      {pending !== null && (
        <dialog
          open
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-text"
          class="fixed inset-0 m-auto w-[min(90vw,28rem)] rounded-2xl border border-line bg-surface p-5 text-ink shadow-float backdrop:bg-black/50"
        >
          <p id="delete-confirm-text" class="text-fluid-base">
            {`Xoá «${pending.title}» khỏi R2?`}
          </p>
          <p class="mt-1 text-fluid-sm text-ink-muted">
            Toàn bộ tệp EPUB, bìa và metadata của truyện sẽ bị xoá khỏi R2, không khôi phục được.
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <IconTextButton icon="close" label="Huỷ" onClick={() => setPending(null)} />
            <IconTextButton icon="trash" label="Xoá" variant="danger" onClick={() => void confirmDelete(pending)} />
          </div>
        </dialog>
      )}
    </section>
  )
}
