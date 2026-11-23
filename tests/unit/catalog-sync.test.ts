import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type Book } from '../../src/db/db'
import { DriveError, type DriveApi, type DriveFile } from '../../src/drive/drive-api'
import {
  catalogStatus,
  createCatalogSync,
  type CatalogSyncDeps,
} from '../../src/catalog/catalog-sync'

type Page = { files: DriveFile[]; nextPageToken?: string }

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

const driveEpub = (id: string, modifiedTime = '2026-11-01T10:00:00.000Z'): DriveFile => ({
  id,
  name: `${id}.epub`,
  size: '1024',
  modifiedTime,
  md5Checksum: `m-${id}`,
  mimeType: 'application/epub+zip',
})

const driveOther = (id: string): DriveFile => ({
  id,
  name: `${id}.jpg`,
  size: '10',
  modifiedTime: '2026-11-01T10:00:00.000Z',
  md5Checksum: `m-${id}`,
  mimeType: 'image/jpeg',
})

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

function storedBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    name: `${id}.epub`,
    title: id,
    normTitle: id,
    size: 1,
    modifiedTime: 0,
    md5: `m-${id}`,
    inDrive: 1,
    lastSeenAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeSync(api: DriveApi | null, extra: Partial<CatalogSyncDeps> = {}) {
  syncer = createCatalogSync({
    db,
    api,
    now: () => clock,
    online: () => online,
    retryDelaysMs: [],
    ...extra,
  })
  return syncer
}

const flushTasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('catalog-sync', () => {
  it('catalog.sync.paged: follows nextPageToken for 450 epubs and shows page one before page two resolves', async () => {
    const page1: Page = { files: range(0, 200).map((i) => driveEpub(`a${i}`)), nextPageToken: 'p2' }
    const page2: Page = { files: range(200, 400).map((i) => driveEpub(`a${i}`)), nextPageToken: 'p3' }
    const page3: Page = {
      files: [...range(400, 450).map((i) => driveEpub(`a${i}`)), driveOther('o1'), driveOther('o2'), driveOther('o3')],
    }
    let releasePage2!: (p: Page) => void
    const listPage = vi.fn((token?: string): Promise<Page> => {
      if (token === undefined) return Promise.resolve(page1)
      if (token === 'p2') return new Promise<Page>((resolve) => (releasePage2 = resolve))
      return Promise.resolve(page3)
    })
    const api = { listPage } as unknown as DriveApi

    const s = makeSync(api)
    const done = s.sync()

    await vi.waitFor(async () => {
      expect(await db.books.count()).toBe(200)
    })
    expect(listPage).toHaveBeenCalledTimes(2)

    releasePage2(page2)
    await done

    expect(listPage.mock.calls.map((c) => c[0])).toEqual([undefined, 'p2', 'p3'])
    expect(await db.books.count()).toBe(450)
    expect(await db.books.where('inDrive').equals(1).count()).toBe(450)
    expect(catalogStatus.value.state).toBe('idle')
  })

  it('catalog.reconcile.partial-failure: a failed page changes no row and keeps the previous lastSyncAt', async () => {
    // First sync (3 books across 2 pages) succeeds; second sync: page 1 ok, page 2 network error.
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ files: [driveEpub('x1'), driveEpub('x2')], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ files: [driveEpub('x3')] })
      .mockResolvedValueOnce({ files: [driveEpub('x1')], nextPageToken: 'p2' })
      .mockRejectedValueOnce(new DriveError('network'))
    const api = { listPage } as unknown as DriveApi
    const s = makeSync(api)

    clock = 1_000
    await s.sync()
    expect(catalogStatus.value.lastSyncAt).toBe(1_000)

    clock = 5_000
    await s.sync()

    expect(listPage).toHaveBeenCalledTimes(4)
    expect(await db.books.count()).toBe(3)
    expect(await db.books.where('inDrive').equals(0).count()).toBe(0)
    expect(await db.books.where('inDrive').equals(1).count()).toBe(3)
    expect(catalogStatus.value.state).toBe('error')
    expect(catalogStatus.value.error).toBe('Không kết nối được Google Drive')
    expect(catalogStatus.value.lastSyncAt).toBe(1_000)
  })

  it('cache.stale.resync: an online event after an offline start refreshes a stale cached book', async () => {
    await db.books.put(storedBook('a', { modifiedTime: Date.parse('2026-10-01T00:00:00.000Z') }))
    const listPage = vi.fn().mockResolvedValue({
      files: [driveEpub('a', '2026-11-20T00:00:00.000Z')],
    })
    const api = { listPage } as unknown as DriveApi
    const onSynced = vi.fn()
    online = false
    const s = makeSync(api, { onSynced })
    await s.start()
    expect(listPage).not.toHaveBeenCalled()

    online = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(onSynced).toHaveBeenCalledTimes(1))
    expect(listPage).toHaveBeenCalledTimes(1)
    expect((await db.books.get('a'))?.modifiedTime).toBe(Date.parse('2026-11-20T00:00:00.000Z'))
  })

  it('catalog.trigger.single-flight: two refresh taps while syncing make one list sequence', async () => {
    let release!: (p: Page) => void
    const listPage = vi.fn(
      () => new Promise<Page>((resolve) => (release = resolve)),
    )
    const api = { listPage } as unknown as DriveApi
    const s = makeSync(api)

    const first = s.sync({ force: true })
    const second = s.sync({ force: true })
    expect(second).toBe(first)

    release({ files: [driveEpub('s1')] })
    await Promise.all([first, second])

    expect(listPage).toHaveBeenCalledTimes(1)
    expect(await db.books.count()).toBe(1)
  })

  it('catalog.trigger.visible-throttle: becoming visible within 5 minutes of a sync does nothing; after 6 minutes it syncs', async () => {
    const listPage = vi.fn().mockResolvedValue({ files: [driveEpub('v1')] })
    const api = { listPage } as unknown as DriveApi
    const s = makeSync(api)

    const t0 = clock
    clock = t0 - 120_000
    await s.start()
    expect(listPage).toHaveBeenCalledTimes(1)
    expect(catalogStatus.value.lastSyncAt).toBe(t0 - 120_000)

    clock = t0
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushTasks()
    expect(listPage).toHaveBeenCalledTimes(1)

    clock = t0 + 240_000 // 6 minutes after the last successful sync
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(listPage).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(catalogStatus.value.lastSyncAt).toBe(t0 + 240_000))
  })

  it('catalog.sync.offline: offline start makes no request, shows the stored catalog and no error', async () => {
    await db.books.put(storedBook('keep'))
    const listPage = vi.fn()
    const api = { listPage } as unknown as DriveApi
    online = false
    const s = makeSync(api)

    await s.start()

    expect(listPage).not.toHaveBeenCalled()
    expect(await db.books.count()).toBe(1)
    expect(catalogStatus.value.state).toBe('idle')
    expect(catalogStatus.value.error).toBeUndefined()
  })

  it('catalog.sync.resync: after an offline start, the online event runs a sync that adds new Drive books', async () => {
    const listPage = vi.fn().mockResolvedValue({ files: [driveEpub('n1'), driveEpub('n2')] })
    const api = { listPage } as unknown as DriveApi
    online = false
    const s = makeSync(api)
    await s.start()
    expect(listPage).not.toHaveBeenCalled()

    online = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => {
      expect(await db.books.count()).toBe(2)
    })
    await vi.waitFor(() => expect(catalogStatus.value.state).toBe('idle'))
    expect((await db.books.get('n1'))?.inDrive).toBe(1)
    expect((await db.books.get('n2'))?.inDrive).toBe(1)
  })

  it('catalog.sync.config-error: a 403 config error sets the Vietnamese message and keeps the stored catalog', async () => {
    await db.books.put(storedBook('keep', { lastSeenAt: 5 }))
    const before = await db.books.get('keep')
    const listPage = vi.fn().mockRejectedValue(new DriveError('config', 403))
    const api = { listPage } as unknown as DriveApi
    const s = makeSync(api)

    await s.sync()

    expect(catalogStatus.value.state).toBe('error')
    expect(catalogStatus.value.error).toBe('Cấu hình Google Drive không hợp lệ')
    expect(await db.books.get('keep')).toEqual(before)
    expect(await db.books.count()).toBe(1)
    expect(listPage).toHaveBeenCalledTimes(1)
  })

  it('catalog-sync: network errors retry after the configured delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let calls = 0
    const listPage = vi.fn(async (): Promise<Page> => {
      calls++
      if (calls === 1) throw new DriveError('network')
      return { files: [driveEpub('r1')] }
    })
    const api = { listPage } as unknown as DriveApi
    const s = makeSync(api, { retryDelaysMs: [1000] })

    await s.sync()
    expect(listPage).toHaveBeenCalledTimes(1)
    expect(catalogStatus.value.state).toBe('error')

    await vi.advanceTimersByTimeAsync(999)
    expect(listPage).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(async () => {
      expect(await db.books.count()).toBe(1)
    })
    expect(listPage).toHaveBeenCalledTimes(2)
    expect(catalogStatus.value.state).toBe('idle')
  })
})
