import { signal } from '@preact/signals'
import type { AppDB } from '../db/db'
import { SourceError, type BookSource } from '../source/r2-source'
import { reattach, reconcile, upsertCatalog } from './catalog-repo'

export interface CatalogStatus {
  state: 'idle' | 'syncing' | 'error'
  lastSyncAt?: number
  error?: string
}

export const catalogStatus = signal<CatalogStatus>({ state: 'idle' })

export interface CatalogSyncDeps {
  db: AppDB
  source: BookSource | null
  now?: () => number
  online?: () => boolean
  onSynced?: () => void
  retryDelaysMs?: number[]
}

export interface CatalogSyncOptions {
  /** Manual refresh. Accepted for the refresh button; the throttle only applies to visibility. */
  force?: boolean
}

const LAST_SYNC_KEY = 'catalog.lastSyncAt'
const VISIBLE_THROTTLE_MS = 5 * 60_000
const NETWORK_ERROR_MESSAGE = 'Không kết nối được máy chủ truyện'

export function createCatalogSync(deps: CatalogSyncDeps): {
  sync(opts?: CatalogSyncOptions): Promise<void>
  start(): Promise<void>
  stop(): void
} {
  const {
    db,
    source,
    now = Date.now,
    online = () => navigator.onLine,
    onSynced,
    retryDelaysMs = [30_000, 60_000, 120_000],
  } = deps

  let inFlight: Promise<void> | null = null
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  function clearRetry(): void {
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
  }

  function scheduleRetry(): void {
    if (retryAttempt >= retryDelaysMs.length) return
    const delay = retryDelaysMs[retryAttempt++]
    clearRetry()
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (online()) void sync()
    }, delay)
  }

  async function run(src: BookSource): Promise<void> {
    const previous = catalogStatus.value
    catalogStatus.value = { ...previous, state: 'syncing', error: undefined }
    const t0 = now()
    let ok = false
    try {
      const entries = await src.fetchCatalog()
      const { newIds } = await upsertCatalog(db, entries, t0)
      await reconcile(db, t0)
      await reattach(db, newIds, now())
      await db.settings.put({ key: LAST_SYNC_KEY, value: t0, updatedAt: t0 })

      retryAttempt = 0
      clearRetry()
      catalogStatus.value = { state: 'idle', lastSyncAt: t0 }
      ok = true
    } catch (err) {
      catalogStatus.value = {
        state: 'error',
        lastSyncAt: previous.lastSyncAt,
        error: err instanceof SourceError ? err.message : NETWORK_ERROR_MESSAGE,
      }
      if (err instanceof SourceError && (err.kind === 'network' || err.kind === 'server')) {
        scheduleRetry()
      }
    }
    if (ok) onSynced?.()
  }

  function sync(_opts?: CatalogSyncOptions): Promise<void> {
    if (inFlight) return inFlight
    if (!source || !online()) return Promise.resolve()
    inFlight = run(source).finally(() => {
      inFlight = null
    })
    return inFlight
  }

  const onOnline = (): void => {
    void sync()
  }

  const onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return
    const last = catalogStatus.value.lastSyncAt
    if (last === undefined || now() - last > VISIBLE_THROTTLE_MS) void sync()
  }

  async function start(): Promise<void> {
    const row = await db.settings.get(LAST_SYNC_KEY)
    if (row && typeof row.value === 'number') {
      catalogStatus.value = { ...catalogStatus.value, lastSyncAt: row.value }
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    await sync()
  }

  function stop(): void {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    clearRetry()
  }

  return { sync, start, stop }
}
