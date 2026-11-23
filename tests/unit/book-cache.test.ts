import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type Book } from '../../src/db/db'
import { DriveError, type DriveApi } from '../../src/drive/drive-api'
import {
  CacheError,
  cacheStats,
  deleteAllCache,
  deleteCache,
  getBookFile,
  isStale,
  listStaleIds,
  refreshStale,
  storeBookFile,
  type CacheDeps,
} from '../../src/cache/book-cache'
import { getProgress, saveProgress } from '../../src/progress/progress-repo'

const NOW = 1_700_000_000_000
const T = 1_600_000_000_000
const HOUR = 3_600_000

let db: AppDB

beforeEach(() => {
  db = new AppDB('t-' + crypto.randomUUID())
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

function book(id: string, over: Partial<Book> = {}): Book {
  return {
    id,
    name: `${id}.epub`,
    title: id,
    normTitle: id,
    size: 1_000_000,
    modifiedTime: T,
    md5: 'm1',
    inDrive: 1,
    lastSeenAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

async function seedBook(b: Book): Promise<void> {
  await db.books.put(b)
}

async function seedFile(bookId: string, md5 = 'm1', modifiedTime = T, bytes = 10): Promise<void> {
  await db.bookFiles.put({
    bookId,
    blob: new Blob([new Uint8Array(bytes)]),
    size: bytes,
    md5,
    modifiedTime,
    cachedAt: NOW,
    lastOpenedAt: NOW,
  })
}

interface FakeApiState {
  calls: string[]
  maxInFlight: number
}

/** Fake DriveApi: resolves a blob of the requested size; `fail` may throw per book id. */
function makeApi(fail?: (id: string) => Error | undefined): { api: DriveApi; state: FakeApiState } {
  const state: FakeApiState = { calls: [], maxInFlight: 0 }
  let inFlight = 0
  const fetchBook = async (
    id: string,
    o: { size: number; onProgress?: (pct: number) => void; signal?: AbortSignal },
  ): Promise<Blob> => {
    state.calls.push(id)
    inFlight++
    state.maxInFlight = Math.max(state.maxInFlight, inFlight)
    try {
      await Promise.resolve()
      o.onProgress?.(50)
      const err = fail?.(id)
      if (err) throw err
      o.onProgress?.(100)
      return new Blob([new Uint8Array(o.size)])
    } finally {
      inFlight--
    }
  }
  return { api: { fetchBook } as unknown as DriveApi, state }
}

function makeDeps(api: DriveApi | null, over: Partial<CacheDeps> = {}): CacheDeps {
  return {
    db,
    api,
    online: () => true,
    now: () => NOW,
    persist: async () => true,
    ...over,
  }
}

describe('book-cache', () => {
  it('cache.fetch.first-read: downloads once, reports progress, stores md5 and modifiedTime, second open is cache-only', async () => {
    await seedBook(book('a', { size: 1_000_000, md5: 'm1', modifiedTime: T }))
    const { api, state } = makeApi()
    const pcts: number[] = []

    const first = await getBookFile(makeDeps(api), 'a', { onProgress: (p) => pcts.push(p) })

    expect(first.usedOld).toBe(false)
    expect(first.blob.size).toBe(1_000_000)
    expect(pcts.length).toBeGreaterThan(0)
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1])
    expect(pcts[pcts.length - 1]).toBe(100)

    const row = await db.bookFiles.get('a')
    expect(row?.md5).toBe('m1')
    expect(row?.modifiedTime).toBe(T)
    expect(row?.size).toBe(1_000_000)

    const second = await getBookFile(makeDeps(api), 'a')
    expect(second.usedOld).toBe(false)
    expect(state.calls).toEqual(['a'])
  })

  it('cache.fetch.interrupted: network drop halfway stores nothing and reports kind network', async () => {
    await seedBook(book('a'))
    const { api } = makeApi(() => new DriveError('network'))

    const err = await getBookFile(makeDeps(api), 'a').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CacheError)
    expect((err as CacheError).kind).toBe('network')
    expect(await db.bookFiles.get('a')).toBeUndefined()
  })

  it('cache.fetch.quota: storing that throws QuotaExceededError reports kind quota', async () => {
    await seedBook(book('a'))
    const { api } = makeApi()
    vi.spyOn(db.bookFiles, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))

    const err = await getBookFile(makeDeps(api), 'a').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CacheError)
    expect((err as CacheError).kind).toBe('quota')
  })

  it('cache.fetch.offline: offline and not cached throws kind offline without a request', async () => {
    await seedBook(book('a'))
    const { api, state } = makeApi()

    const err = await getBookFile(makeDeps(api, { online: () => false }), 'a').catch((e: unknown) => e)

    expect((err as CacheError).kind).toBe('offline')
    expect(state.calls).toEqual([])
  })

  it('cache.persist.removed-from-drive: a cached book with inDrive 0 opens from the cache', async () => {
    await seedBook(book('a', { inDrive: 0, md5: 'm1' }))
    await seedFile('a', 'm1', T)
    const { api, state } = makeApi()

    const res = await getBookFile(makeDeps(api), 'a')

    expect(res.usedOld).toBe(false)
    expect(res.md5).toBe('m1')
    expect(state.calls).toEqual([])
  })

  it('cache.stale.detect: stale only when book md5 differs and book modifiedTime is newer', () => {
    const file = { bookId: 'a', blob: new Blob([]), size: 0, md5: 'm1', modifiedTime: T, cachedAt: NOW, lastOpenedAt: NOW }

    expect(isStale(book('a', { md5: 'm2', modifiedTime: T + HOUR }), file)).toBe(true)
    expect(isStale(book('a', { md5: 'm2', modifiedTime: T - HOUR }), file)).toBe(false)
    expect(isStale(undefined, file)).toBe(false)
    expect(isStale(book('a', { md5: 'm2', modifiedTime: T + HOUR, inDrive: 0 }), file)).toBe(false)
  })

  it('cache.stale.background-refresh: refreshStale re-downloads stale books one after the other', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedBook(book('b', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    await seedFile('b', 'm1', T)
    const { api, state } = makeApi()
    expect((await listStaleIds(db)).sort()).toEqual(['a', 'b'])

    await refreshStale(makeDeps(api))

    expect(state.calls.sort()).toEqual(['a', 'b'])
    expect(state.maxInFlight).toBe(1)
    expect((await db.bookFiles.get('a'))?.md5).toBe('m2')
    expect((await db.bookFiles.get('b'))?.md5).toBe('m2')
    expect(await listStaleIds(db)).toEqual([])
  })

  it('book-cache: refreshStale runs downloads serially', async () => {
    for (const id of ['a', 'b', 'c']) {
      await seedBook(book(id, { md5: 'm2', modifiedTime: T + HOUR }))
      await seedFile(id, 'm1', T)
    }
    const { api, state } = makeApi()

    await refreshStale(makeDeps(api))

    expect(state.calls).toHaveLength(3)
    expect(state.maxInFlight).toBe(1)
  })

  it('cache.stale.open-online: stale book opened online is downloaded, stored and returned', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { api, state } = makeApi()

    const res = await getBookFile(makeDeps(api), 'a')

    expect(res.usedOld).toBe(false)
    expect(res.md5).toBe('m2')
    expect(state.calls).toEqual(['a'])
    expect((await db.bookFiles.get('a'))?.md5).toBe('m2')
  })

  it('cache.stale.offline: stale book opened offline returns the old copy with usedOld true', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { api, state } = makeApi()

    const res = await getBookFile(makeDeps(api, { online: () => false }), 'a')

    expect(res.usedOld).toBe(true)
    expect(res.md5).toBe('m1')
    expect(state.calls).toEqual([])
  })

  it('cache.stale.refresh-fails: failed background refresh keeps the old blob and the book stays stale', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { api } = makeApi(() => new DriveError('network'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(refreshStale(makeDeps(api))).resolves.toBeUndefined()

    expect((await db.bookFiles.get('a'))?.md5).toBe('m1')
    expect(await listStaleIds(db)).toEqual(['a'])
  })

  it('cache.clear.one: deleteCache removes one file and leaves progress unchanged', async () => {
    await seedBook(book('a'))
    await seedBook(book('b'))
    await seedFile('a')
    await seedFile('b')
    await saveProgress(db, {
      id: 'a', bookId: 'a', normTitle: 'a', cfi: 'c', snippet: 's', sectionIndex: 1,
      sectionHref: 'h', sectionFraction: 0.5, fraction: 0.25, bookMd5: 'm1',
    }, NOW)
    const before = await getProgress(db, 'a')

    await deleteCache(db, 'a')

    expect((await db.bookFiles.toArray()).map((f) => f.bookId)).toEqual(['b'])
    expect(await getProgress(db, 'a')).toEqual(before)
  })

  it('cache.clear.all: deleteAllCache empties bookFiles and leaves progress unchanged', async () => {
    await seedBook(book('a'))
    await seedBook(book('b'))
    await seedFile('a')
    await seedFile('b')
    await saveProgress(db, {
      id: 'a', bookId: 'a', normTitle: 'a', cfi: 'c', snippet: 's', sectionIndex: 1,
      sectionHref: 'h', sectionFraction: 0.5, fraction: 0.25, bookMd5: 'm1',
    }, NOW)
    const before = await getProgress(db, 'a')

    await deleteAllCache(db)

    expect(await db.bookFiles.count()).toBe(0)
    expect(await getProgress(db, 'a')).toEqual(before)
  })

  it('cache.clear.local-only: deleting the cache of a local-only book removes it from books and covers', async () => {
    await seedBook(book('c', { inDrive: 0 }))
    await seedFile('c')
    await db.covers.put({ bookId: 'c', blob: new Blob(['cover']), md5: 'x', fetchedAt: NOW })

    await deleteCache(db, 'c')

    expect(await db.books.get('c')).toBeUndefined()
    expect(await db.covers.get('c')).toBeUndefined()
    expect(await db.bookFiles.get('c')).toBeUndefined()
  })

  it('book-cache: persist is requested exactly once across two stores', async () => {
    vi.resetModules()
    const fresh = await import('../../src/cache/book-cache')
    const persist = vi.fn(async () => true)
    const deps: CacheDeps = { db, api: null, online: () => true, now: () => NOW, persist }
    const b1 = book('a')
    const b2 = book('b')
    await seedBook(b1)
    await seedBook(b2)

    await fresh.storeBookFile(deps, b1, new Blob(['one']))
    await fresh.storeBookFile(deps, b2, new Blob(['two']))

    expect(persist).toHaveBeenCalledTimes(1)
    expect(await db.settings.get('storage.persistRequested')).toBeDefined()
  })

  it('book-cache: getBookFile for an unknown book with no file throws not-found', async () => {
    const { api, state } = makeApi()

    const err = await getBookFile(makeDeps(api), 'missing').catch((e: unknown) => e)

    expect((err as CacheError).kind).toBe('not-found')
    expect(state.calls).toEqual([])
  })

  it('book-cache: cacheStats counts cached files and sums their sizes', async () => {
    await seedFile('a', 'm1', T, 10)
    await seedFile('b', 'm1', T, 25)

    const stats = await cacheStats(db)

    expect(stats.count).toBe(2)
    expect(stats.bytes).toBe(35)
    // coversBytes is not asserted here: fake-indexeddb does not round-trip Blob.size in this env.
    expect(typeof stats.coversBytes).toBe('number')
  })
})
