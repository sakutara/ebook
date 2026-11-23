import { useState } from 'preact/hooks'
import { normalize } from '../../../src/domain/title'
import { IconButton, IconTextButton } from '../../../src/ui/icons/Icon'
import type { Metadata } from '../types'
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
  const [pending, setPending] = useState<Metadata | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = normalize(query)
  const shown = q === '' ? books : books.filter((b) => normalize(b.title).includes(q) || normalize(b.author).includes(q))

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
        <h2 id="published-heading" class="text-fluid-lg font-semibold">
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
      {error !== null && <p role="alert" class="text-fluid-sm text-red-600 dark:text-red-400">{`Lỗi: ${error}`}</p>}

      <div class="grid gap-1 text-fluid-sm">
        <label for="published-search">Tìm truyện đã đăng</label>
        <input
          id="published-search"
          type="search"
          class="min-h-11 rounded-lg border border-ink-muted/40 bg-surface px-3 text-fluid-base text-ink"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      <ul class="grid gap-3">
        {shown.map((book) => (
          <li key={book.id} class="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
            <img
              src={`${base}/books/${book.id}/cover.jpg?v=${book.md5}`}
              alt=""
              loading="lazy"
              class="h-24 w-16 shrink-0 rounded-md bg-surface object-cover"
            />
            <div class="grid min-w-0 flex-1 gap-1">
              <p class="truncate text-fluid-base font-medium">{book.title}</p>
              <p class="truncate text-fluid-sm text-ink-muted">{book.author}</p>
              {book.genres.length > 0 && <p class="text-fluid-sm text-ink-muted">{book.genres.join(', ')}</p>}
              <p class="text-fluid-sm tabular-nums text-ink-muted">{formatMb(book.size)}</p>
            </div>
            <IconButton
              icon="trash"
              label="Xoá"
              variant="danger"
              disabled={!connected || busy}
              onClick={() => setPending(book)}
            />
          </li>
        ))}
      </ul>

      {pending !== null && (
        <dialog
          open
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-text"
          class="fixed inset-0 m-auto w-[min(90vw,28rem)] rounded-xl bg-surface p-4 text-ink shadow-xl backdrop:bg-black/40"
        >
          <p id="delete-confirm-text" class="text-fluid-base">
            {`Xoá «${pending.title}» khỏi R2?`}
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
