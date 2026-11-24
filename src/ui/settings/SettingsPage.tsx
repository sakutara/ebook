import { useEffect, useRef, useState } from 'preact/hooks'
import { liveQuery } from 'dexie'
import { catalogStatus } from '../../catalog/catalog-sync'
import { cacheStats, deleteAllCache } from '../../cache/book-cache'
import { clearAllProgress } from '../../progress/progress-repo'
import { exportData, importData } from '../../data/backup'
import type { AppDB } from '../../db/db'
import type { R2Config } from '../../config'
import { Icon, IconButton, IconTextButton } from '../icons/Icon'
import { removeSavedCopies } from '../cache-actions'
import { useBackClose } from '../useBackClose'

export interface SettingsProps {
  db: AppDB
  /** Worker config; `null` when `VITE_R2_BASE_URL` is not set. */
  config: R2Config | null
  onRefresh: () => void
  /** Optional replacement for the in-page confirm dialog. When given, destructive actions await it. */
  confirm?: (message: string) => Promise<boolean>
}

interface CachedRow {
  bookId: string
  title: string
  size: number
  lastOpenedAt: number
}

interface StorageInfo {
  usage?: number
  quota?: number
  persisted?: boolean
}

const EMPTY_STATS = { count: 0, bytes: 0 }

const MB_BYTES = 1048576
const MB_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 }

function formatMb(bytes: number): string {
  return (bytes / MB_BYTES).toLocaleString('vi-VN', MB_FORMAT)
}

const pad = (n: number) => String(n).padStart(2, '0')

function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Subscribe to a Dexie liveQuery for the lifetime of the component. */
function useLive<T>(db: AppDB, query: (db: AppDB) => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const sub = liveQuery(() => query(db)).subscribe({
      next: setValue,
      error: (e) => console.error('settings: live query failed', e),
    })
    return () => sub.unsubscribe()
    // `query` is a module-level function; only the db identity matters.
  }, [db])
  return value
}

/** Cached files joined with their titles, newest-opened first. Blob contents are never read. */
async function listCached(db: AppDB): Promise<CachedRow[]> {
  const files = await db.bookFiles.toArray()
  const books = await db.books.bulkGet(files.map((f) => f.bookId))
  return files
    .map((f, i) => ({
      bookId: f.bookId,
      title: books[i]?.title ?? f.bookId,
      size: f.size,
      lastOpenedAt: f.lastOpenedAt,
    }))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}

function sourceStatusText(): string {
  const s = catalogStatus.value
  if (s.state === 'syncing') return 'Đang cập nhật…'
  if (s.state === 'error') return s.error ?? 'Cập nhật thất bại'
  if (s.lastSyncAt !== undefined) return `Cập nhật lúc ${formatDateTime(s.lastSyncAt)}`
  return 'Chưa cập nhật'
}

/** Host of the book worker, or the not-configured text. */
function sourceHost(config: R2Config | null | undefined): string {
  if (!config) return 'Chưa cấu hình'
  try {
    return new URL(config.baseUrl).host
  } catch {
    return 'Chưa cấu hình'
  }
}

interface PendingConfirm {
  message: string
  confirmLabel: string
  run: () => Promise<void>
}

export function ConfirmDialog(p: {
  open: boolean
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useBackClose(p.open, p.onCancel)
  if (!p.open) return null
  return (
    <dialog
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-message"
      class="fixed inset-0 m-auto w-[min(90vw,28rem)] rounded-2xl border border-line bg-surface p-5 text-ink shadow-float backdrop:bg-black/50"
    >
      <p id="confirm-dialog-message" class="text-fluid-base">
        {p.message}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <IconTextButton icon="close" label="Huỷ" onClick={p.onCancel} />
        <IconTextButton icon="confirm" label={p.confirmLabel} variant="danger" onClick={p.onConfirm} />
      </div>
    </dialog>
  )
}

type SortKey = 'recent' | 'size' | 'title'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Mở gần nhất' },
  { value: 'size', label: 'Dung lượng lớn nhất' },
  { value: 'title', label: 'Tên A–Z' },
]

/** Read past this fraction counts as finished ("Xoá truyện đã đọc xong"). */
const FINISHED = 0.99

/** Human size with a unit that fits: "820 KB", "8,5 MB", "35,4 GB". */
function formatBytes(bytes: number): string {
  if (bytes < MB_BYTES) return `${Math.max(0, Math.round(bytes / 1024)).toLocaleString('vi-VN')} KB`
  if (bytes < 1024 * MB_BYTES) return `${formatMb(bytes)} MB`
  return `${(bytes / (1024 * MB_BYTES)).toLocaleString('vi-VN', MB_FORMAT)} GB`
}

async function progressById(db: AppDB): Promise<Map<string, number>> {
  const rows = await db.progress.toArray()
  return new Map(rows.filter((r) => r.deleted === 0).map((r) => [r.bookId, r.fraction] as const))
}

const SECTION = 'card flex flex-col gap-3 p-4 sm:p-5'
const HINT = 'text-fluid-sm text-ink-muted'

export function SettingsPage(p: SettingsProps) {
  const { db, onRefresh } = p
  const cached = useLive(db, listCached, [])
  const stats = useLive(db, cacheStats, EMPTY_STATS)
  const fractions = useLive(db, progressById, new Map<string, number>())
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [notice, setNotice] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const fileInput = useRef<HTMLInputElement>(null)

  const rows = [...cached].sort((a, b) =>
    sort === 'size' ? b.size - a.size : sort === 'title' ? a.title.localeCompare(b.title, 'vi') : b.lastOpenedAt - a.lastOpenedAt,
  )
  const finished = cached.filter((r) => (fractions.get(r.bookId) ?? 0) >= FINISHED)
  const chosen = cached.filter((r) => selected.has(r.bookId))
  const allChosen = cached.length > 0 && chosen.length === cached.length

  // Storage estimate and persistence flag; refreshed whenever the cache totals change.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const info: StorageInfo = {}
      try {
        const est = await navigator.storage?.estimate?.()
        info.usage = est?.usage
        info.quota = est?.quota
      } catch {
        // Estimate is optional.
      }
      try {
        info.persisted = await navigator.storage?.persisted?.()
      } catch {
        // Persistence flag is optional.
      }
      if (!cancelled) setStorage(info)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [stats.count, stats.bytes])

  async function runAction(action: () => Promise<void>, failurePrefix: string) {
    try {
      await action()
      setNotice('')
    } catch (e) {
      setNotice(`${failurePrefix}: ${errorMessage(e)}`)
    }
  }

  function askConfirm(message: string, confirmLabel: string, run: () => Promise<void>) {
    if (p.confirm) {
      void p.confirm(message).then((ok) => {
        if (ok) void runAction(run, 'Không thực hiện được')
      })
      return
    }
    setPending({ message, confirmLabel, run })
  }

  function onConfirm() {
    const current = pending
    setPending(null)
    if (current) void runAction(current.run, 'Không thực hiện được')
  }

  function removeRows(list: CachedRow[]) {
    setSelected(new Set())
    void runAction(
      () => removeSavedCopies(db, list.map((r) => ({ id: r.bookId, title: r.title }))),
      'Xoá thất bại',
    )
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  async function askPersist() {
    try {
      const granted = await navigator.storage?.persist?.()
      setStorage((s) => ({ ...(s ?? {}), persisted: granted === true }))
      setNotice(granted ? '' : 'Trình duyệt chưa cho phép. Hãy cài ứng dụng lên màn hình chính rồi thử lại.')
    } catch (e) {
      setNotice(`Không bật được: ${errorMessage(e)}`)
    }
  }

  async function onExport() {
    await runAction(async () => {
      const blob = await exportData(db)
      const url = URL.createObjectURL(blob)
      const d = new Date()
      const a = document.createElement('a')
      a.href = url
      a.download = `tu-truyen-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }, 'Xuất dữ liệu thất bại')
  }

  async function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const { imported } = await importData(db, await file.text())
      setNotice(`Đã nhập ${imported} mục`)
    } catch (err) {
      setNotice(errorMessage(err))
    } finally {
      input.value = ''
    }
  }

  const usagePct =
    storage?.usage !== undefined && storage.quota ? Math.min(100, Math.max(1, (storage.usage / storage.quota) * 100)) : undefined

  return (
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-5 py-4">
      <section aria-labelledby="settings-source" class={SECTION}>
        <h2 id="settings-source" class="text-fluid-lg font-semibold">
          Máy chủ truyện
        </h2>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-fluid-base font-medium">{sourceHost(p.config)}</p>
            <p class={HINT}>{sourceStatusText()}</p>
          </div>
          <IconTextButton icon="refresh" label="Làm mới" onClick={() => onRefresh()} />
        </div>
      </section>

      <section aria-labelledby="settings-storage" class={SECTION}>
        <div class="flex items-baseline justify-between gap-2">
          <h2 id="settings-storage" class="text-fluid-lg font-semibold">
            Truyện đã lưu trên máy
          </h2>
          <p class="text-fluid-sm font-semibold tabular-nums">{`${stats.count} truyện · ${formatMb(stats.bytes)} MB`}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div class="h-full rounded-full bg-accent" style={{ width: `${usagePct ?? 0}%` }} />
          </div>
          <p class={HINT}>
            {storage?.usage !== undefined && storage.quota !== undefined
              ? `Trình duyệt đang dùng ${formatBytes(storage.usage)} trên ${formatBytes(storage.quota)}`
              : 'Không rõ dung lượng trống của trình duyệt'}
          </p>
        </div>

        {storage?.persisted ? (
          <p class="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-fluid-sm">
            <Icon name="confirm" class="size-5 text-accent" />
            Truyện đã lưu được giữ lại, trình duyệt sẽ không tự dọn.
          </p>
        ) : (
          <div class="flex flex-col items-start gap-1 rounded-xl bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-fluid-sm text-ink-muted">
              Khi máy đầy bộ nhớ, trình duyệt có thể tự xoá truyện đã lưu.
            </p>
            <IconTextButton icon="saved" label="Giữ truyện đã lưu" onClick={() => void askPersist()} />
          </div>
        )}

        {cached.length > 0 ? (
          <>
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <label class="flex min-h-11 cursor-pointer items-center gap-2 text-fluid-sm">
                <input
                  type="checkbox"
                  class="size-5 accent-accent"
                  checked={allChosen}
                  onChange={(e) =>
                    setSelected(e.currentTarget.checked ? new Set(cached.map((r) => r.bookId)) : new Set())
                  }
                />
                {chosen.length > 0 ? `Đã chọn ${chosen.length}` : 'Chọn tất cả'}
              </label>
              <label class="flex items-center gap-2 text-fluid-sm text-ink-muted">
                Sắp xếp
                <select
                  aria-label="Sắp xếp truyện đã lưu"
                  value={sort}
                  onChange={(e) => setSort(e.currentTarget.value as SortKey)}
                  class="field min-h-10 w-auto py-1 text-fluid-sm"
                >
                  {SORTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ul class="-my-1 flex flex-col divide-y divide-line">
              {rows.map((row) => {
                const pct = fractions.get(row.bookId)
                return (
                  <li key={row.bookId} class="flex items-center gap-3 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${row.title}`}
                      class="size-5 shrink-0 cursor-pointer accent-accent"
                      checked={selected.has(row.bookId)}
                      onChange={(e) => toggle(row.bookId, e.currentTarget.checked)}
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-fluid-base">{row.title}</p>
                      <p class="text-fluid-sm tabular-nums text-ink-muted">
                        {`${formatMb(row.size)} MB · mở ${formatDate(row.lastOpenedAt)}${pct !== undefined ? ` · đọc ${Math.round(pct * 100)}%` : ''}`}
                      </p>
                    </div>
                    <IconButton
                      icon="trash"
                      label={`Xoá bản lưu: ${row.title}`}
                      variant="danger"
                      onClick={() => removeRows([row])}
                    />
                  </li>
                )
              })}
            </ul>

            <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              {chosen.length > 0 && (
                <IconTextButton
                  icon="trash"
                  label={`Xoá ${chosen.length} truyện đã chọn`}
                  variant="danger"
                  onClick={() => removeRows(chosen)}
                />
              )}
              {finished.length > 0 && chosen.length === 0 && (
                <IconTextButton
                  icon="confirm"
                  label={`Xoá ${finished.length} truyện đã đọc xong`}
                  onClick={() => removeRows(finished)}
                />
              )}
              <IconTextButton
                icon="trash-all"
                label="Xoá tất cả bản lưu"
                variant="danger"
                onClick={() =>
                  askConfirm(
                    'Xoá toàn bộ truyện đã lưu trên máy? Tiến độ đọc vẫn được giữ.',
                    'Xoá',
                    () => deleteAllCache(db),
                  )
                }
              />
            </div>
          </>
        ) : (
          <p class={HINT}>Chưa có truyện nào được lưu trên máy. Truyện được lưu tự động khi bạn mở đọc.</p>
        )}
      </section>

      <section aria-labelledby="settings-progress" class={SECTION}>
        <h2 id="settings-progress" class="text-fluid-lg font-semibold">
          Tiến độ đọc
        </h2>
        <p class={HINT}>Vị trí đang đọc của mọi truyện. Xoá thì truyện sẽ mở lại từ đầu.</p>
        <div class="flex justify-end">
          <IconTextButton
            icon="progress-clear"
            label="Xoá tiến độ đọc"
            variant="danger"
            onClick={() =>
              askConfirm('Xoá toàn bộ tiến độ đọc? Truyện sẽ mở lại từ đầu.', 'Xoá', async () => {
                await clearAllProgress(db)
              })
            }
          />
        </div>
      </section>

      <section aria-labelledby="settings-backup" class={SECTION}>
        <h2 id="settings-backup" class="text-fluid-lg font-semibold">
          Sao lưu
        </h2>
        <p class={HINT}>Lưu tiến độ đọc và yêu cầu truyện ra một tệp, để chuyển sang máy khác.</p>
        <div class="flex flex-wrap justify-end gap-2">
          <IconTextButton icon="export" label="Xuất dữ liệu" onClick={() => void onExport()} />
          <IconTextButton icon="import" label="Nhập dữ liệu" onClick={() => fileInput.current?.click()} />
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            class="hidden"
            aria-label="Chọn tệp sao lưu"
            onChange={onFileChange}
          />
        </div>
      </section>

      <p role="status" class="text-fluid-sm empty:hidden">
        {notice}
      </p>

      <footer class="text-center text-fluid-sm text-ink-muted">Phiên bản {__APP_VERSION__}</footer>

      <ConfirmDialog
        open={pending !== null}
        message={pending?.message ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Xoá'}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
