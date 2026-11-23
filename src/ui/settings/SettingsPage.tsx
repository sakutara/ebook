import { useEffect, useRef, useState } from 'preact/hooks'
import { liveQuery } from 'dexie'
import { catalogStatus } from '../../catalog/catalog-sync'
import { cacheStats, deleteAllCache, deleteCache } from '../../cache/book-cache'
import { clearAllProgress } from '../../progress/progress-repo'
import { exportData, importData } from '../../data/backup'
import type { AppDB } from '../../db/db'
import type { R2Config } from '../../config'
import { IconButton, IconTextButton } from '../icons/Icon'

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
  if (!p.open) return null
  return (
    <dialog
      open
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-message"
      class="fixed inset-0 m-auto w-[min(90vw,28rem)] rounded-xl bg-surface p-4 text-ink shadow-xl backdrop:bg-black/40"
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

export function SettingsPage(p: SettingsProps) {
  const { db, onRefresh } = p
  const cached = useLive(db, listCached, [])
  const stats = useLive(db, cacheStats, EMPTY_STATS)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

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

  const hasCached = cached.length > 0
  const mb = formatMb(stats.bytes)

  return (
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 lg:p-8">
      <h1 class="text-fluid-xl font-semibold">Cài đặt</h1>

      <section aria-labelledby="settings-source" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <h2 id="settings-source" class="text-fluid-lg font-semibold">
          Máy chủ truyện
        </h2>
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-fluid-base">{sourceHost(p.config)}</p>
            <p class="text-fluid-sm">{sourceStatusText()}</p>
          </div>
          <IconButton icon="refresh" label="Làm mới" onClick={() => onRefresh()} />
        </div>
      </section>

      <section aria-labelledby="settings-storage" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <h2 id="settings-storage" class="text-fluid-lg font-semibold">
          Bộ nhớ
        </h2>
        <p class="text-fluid-sm">{`${stats.count} truyện · ${mb} MB`}</p>
        <p class="text-fluid-sm">
          {storage?.usage !== undefined && storage.quota !== undefined
            ? `Trình duyệt đang dùng ${formatMb(storage.usage)} MB / ${formatMb(storage.quota)} MB`
            : 'Dung lượng trình duyệt: Không rõ'}
        </p>
        <p class="text-fluid-sm">
          {`Lưu trữ bền vững: ${storage?.persisted === undefined ? 'Không rõ' : storage.persisted ? 'Có' : 'Không'}`}
        </p>

        {hasCached ? (
          <>
            <ul class="lg:hidden flex flex-col divide-y divide-surface-2">
              {cached.map((row) => (
                <li key={row.bookId} class="flex items-center justify-between gap-2 py-1">
                  <div class="min-w-0">
                    <p class="truncate text-fluid-base">{row.title}</p>
                    <p class="text-fluid-sm text-ink/70">
                      {`${formatMb(row.size)} MB · ${formatDate(row.lastOpenedAt)}`}
                    </p>
                  </div>
                  <IconButton
                    icon="trash"
                    label={`Xoá bản lưu: ${row.title}`}
                    variant="danger"
                    onClick={() => void runAction(() => deleteCache(db, row.bookId), 'Xoá thất bại')}
                  />
                </li>
              ))}
            </ul>
            <table class="hidden lg:table w-full text-left text-fluid-sm">
              <thead>
                <tr>
                  <th scope="col" class="py-2 pr-2 font-semibold">
                    Tên truyện
                  </th>
                  <th scope="col" class="py-2 pr-2 font-semibold">
                    Dung lượng
                  </th>
                  <th scope="col" class="py-2 pr-2 font-semibold">
                    Mở lần cuối
                  </th>
                  <th scope="col" class="py-2" />
                </tr>
              </thead>
              <tbody>
                {cached.map((row) => (
                  <tr key={row.bookId} class="border-t border-surface">
                    <td class="py-2 pr-2">{row.title}</td>
                    <td class="py-2 pr-2">{`${formatMb(row.size)} MB`}</td>
                    <td class="py-2 pr-2">{formatDate(row.lastOpenedAt)}</td>
                    <td class="py-2">
                      <IconButton
                        icon="trash"
                        label={`Xoá bản lưu: ${row.title}`}
                        variant="danger"
                        onClick={() => void runAction(() => deleteCache(db, row.bookId), 'Xoá thất bại')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p class="text-fluid-sm text-ink/70">Chưa có truyện nào được lưu trên máy.</p>
        )}

        <div class="flex justify-end gap-2">
          <IconButton
            icon="trash-all"
            label="Xoá toàn bộ cache"
            variant="danger"
            disabled={stats.count === 0}
            onClick={() =>
              askConfirm(
                'Xoá toàn bộ truyện đã lưu trên máy? Tiến độ đọc vẫn được giữ.',
                'Xoá',
                () => deleteAllCache(db),
              )
            }
          />
        </div>
      </section>

      <section aria-labelledby="settings-progress" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <h2 id="settings-progress" class="text-fluid-lg font-semibold">
          Tiến độ đọc
        </h2>
        <div class="flex justify-end gap-2">
          <IconButton
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

      <section aria-labelledby="settings-backup" class="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <h2 id="settings-backup" class="text-fluid-lg font-semibold">
          Sao lưu
        </h2>
        <div class="flex justify-end gap-2">
          <IconButton icon="export" label="Xuất dữ liệu" onClick={() => void onExport()} />
          <IconButton icon="import" label="Nhập dữ liệu" onClick={() => fileInput.current?.click()} />
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            class="hidden"
            aria-label="Chọn tệp sao lưu"
            onChange={onFileChange}
          />
        </div>
        <p role="status" class="text-fluid-sm">
          {notice}
        </p>
      </section>

      <footer class="text-fluid-sm text-ink/70">Phiên bản {__APP_VERSION__}</footer>

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
