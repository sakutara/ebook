import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type Book } from '../../src/db/db'
import {
  catalogStatus,
  createCatalogSync,
  type CatalogSyncDeps,
} from '../../src/catalog/catalog-sync'
import {
  createR2Source,
  SourceError,
  type BookSource,
  type CatalogEntry,
} from '../../src/source/r2-source'

let db: AppDB
let clock: number
let online: boolean
let syncer: ReturnType<typeof createCatalogSync> | undefined
let visibility: 'visible' | 'hidden'

beforeEach(() => {
  db = new AppDB('t-' + crypto.randomUUID())
  clock = 10_000_000
  online = true
  visibility = 'visible'
  catalogStatus.value = { state: 'idle' }
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(async () => {
  syncer?.stop()
  syncer = undefined
  vi.useRealTimers()
  delete (document as unknown as { visibilityState?: unknown }).visibilityState
  db.close()
  await db.delete()
})

const entry = (id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id,
  title: `Title ${id}`,
  epub: `${id}.epub`,
  size: 1024,
  md5: `m-${id}`,
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
})

/** A BookSource whose only working method is fetchCatalog. */
function fakeSource(fetchCatalog: () => Promise<CatalogEntry[]>): BookSource {
  return {
    fetchCatalog,
    coverUrl: () => '',
    epubUrl: () => '',
    fetchBook: () => Promise.reject(new Error('fetchBook is not used by catalog sync')),
  }
}

function storedBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    name: `${id}.epub`,
    title: id,
    normTitle: id,
    author: '',
    normAuthor: '',
    genres: [],
    description: '',
    size: 1,
    modifiedTime: 0,
    md5: `m-${id}`,
    inDrive: 1,
    lastSeenAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeSync(source: BookSource | null, extra: Partial<CatalogSyncDeps> = {}) {
  syncer = createCatalogSync({
    db,
    source,
    now: () => clock,
    online: () => online,
    retryDelaysMs: [],
    ...extra,
  })
  return syncer
}

const flushTasks = () => new Promise((resolve) => setTimeout(resolve, 0))
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

describe('catalog-sync', () => {
  it('catalog.sync.single-request: one request to <base>/catalog.json stores every entry', async () => {
    const books = range(0, 450).map((i) => ({
      id: `b${i}`,
      title: `Truyện ${i}`,
      epub: `b${i}.epub`,
      size: 10,
      md5: `m${i}`,
    }))
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ schema: 1, books }), { status: 200 }),
    )
    const source = createR2Source({ baseUrl: 'https://r2.test' }, fetchFn)
    const s = makeSync(source)

    await s.sync()

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://r2.test/catalog.json')
    expect(await db.books.count()).toBe(450)
    expect(await db.books.where('inDrive').equals(1).count()).toBe(450)
    expect(catalogStatus.value.state).toBe('idle')
  })

  it('catalog.reconcile.failure: a network error changes no row, keeps lastSyncAt, and retries after 30 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fetchCatalog = vi
      .fn<() => Promise<CatalogEntry[]>>()
      .mockResolvedValueOnce([entry('x1'), entry('x2')])
      .mockRejectedValueOnce(new SourceError('network'))
      .mockResolvedValueOnce([entry('x1'), entry('x2')])
    const s = makeSync(fakeSource(fetchCatalog), { retryDelaysMs: [30_000] })

    clock = 1_000
    await s.sync()
    expect(catalogStatus.value.lastSyncAt).toBe(1_000)

    clock = 5_000
    await s.sync()

    expect(fetchCatalog).toHaveBeenCalledTimes(2)
    expect(await db.books.count()).toBe(2)
    expect(await db.books.where('inDrive').equals(0).count()).toBe(0)
    expect(catalogStatus.value.state).toBe('error')
    expect(catalogStatus.value.error).toBe('Không kết nối được máy chủ truyện')
    expect(catalogStatus.value.lastSyncAt).toBe(1_000)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchCatalog).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchCatalog).toHaveBeenCalledTimes(3)
    await vi.waitFor(() => expect(catalogStatus.value.state).toBe('idle'))
  })

  it('catalog.trigger.single-flight: two refresh taps while syncing make one catalog request', async () => {
    let release!: (entries: CatalogEntry[]) => void
    const fetchCatalog = vi.fn(
      () => new Promise<CatalogEntry[]>((resolve) => (release = resolve)),
    )
    const s = makeSync(fakeSource(fetchCatalog))

    const first = s.sync({ force: true })
    const second = s.sync({ force: true })
    expect(second).toBe(first)

    release([entry('s1')])
    await Promise.all([first, second])

    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(await db.books.count()).toBe(1)
  })

  it('catalog.trigger.visible-throttle: becoming visible within 5 minutes of a sync does nothing; after 6 minutes it syncs', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue([entry('v1')])
    const s = makeSync(fakeSource(fetchCatalog))

    const t0 = clock
    clock = t0 - 120_000
    await s.start()
    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(catalogStatus.value.lastSyncAt).toBe(t0 - 120_000)

    clock = t0
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushTasks()
    expect(fetchCatalog).toHaveBeenCalledTimes(1)

    clock = t0 + 240_000 // 6 minutes after the last successful sync
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetchCatalog).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(catalogStatus.value.lastSyncAt).toBe(t0 + 240_000))
  })

  it('catalog.sync.offline: offline start makes no request, keeps the stored catalog and shows no error', async () => {
    await db.books.put(storedBook('keep'))
    const fetchCatalog = vi.fn()
    online = false
    const s = makeSync(fakeSource(fetchCatalog))

    await s.start()

    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(await db.books.count()).toBe(1)
    expect(catalogStatus.value.state).toBe('idle')
    expect(catalogStatus.value.error).toBeUndefined()
  })

  it('catalog.sync.resync: after an offline start, the online event runs a sync that adds new books', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue([entry('n1'), entry('n2')])
    online = false
    const s = makeSync(fakeSource(fetchCatalog))
    await s.start()
    expect(fetchCatalog).not.toHaveBeenCalled()

    online = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => {
      expect(await db.books.count()).toBe(2)
    })
    await vi.waitFor(() => expect(catalogStatus.value.state).toBe('idle'))
    expect((await db.books.get('n1'))?.inDrive).toBe(1)
    expect((await db.books.get('n2'))?.inDrive).toBe(1)
  })

  it('catalog.sync.server-error: a 503 shows the Worker message, keeps the stored catalog and retries after 30 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await db.books.put(storedBook('keep', { lastSeenAt: 5 }))
    const before = await db.books.get('keep')
    const fetchCatalog = vi
      .fn<() => Promise<CatalogEntry[]>>()
      .mockRejectedValueOnce(new SourceError('server', 503))
      .mockResolvedValueOnce([entry('keep')])
    const s = makeSync(fakeSource(fetchCatalog), { retryDelaysMs: [30_000, 60_000, 120_000] })

    await s.sync()

    expect(catalogStatus.value.state).toBe('error')
    expect(catalogStatus.value.error).toBe('Máy chủ truyện đang bận, thử lại sau')
    expect(await db.books.get('keep')).toEqual(before)
    expect(await db.books.count()).toBe(1)
    expect(fetchCatalog).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchCatalog).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(catalogStatus.value.state).toBe('idle'))
  })
})
