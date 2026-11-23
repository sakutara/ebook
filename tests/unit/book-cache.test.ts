import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type Book } from '../../src/db/db'
import { SourceError, type BookSource } from '../../src/source/r2-source'
import { upsertCatalog } from '../../src/catalog/catalog-repo'
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
    author: '',
    normAuthor: '',
    genres: [],
    description: '',
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

interface FakeSourceOptions {
  /** Throws this error for the book id, after progress was reported. */
  fail?: (id: string) => Error | undefined
  /** Progress values reported before the blob is returned. Default: [50, 100]. */
  pcts?: (number | null)[]
  /** Never resolves until the signal aborts, then rejects with an AbortError. */
  hang?: boolean
}

interface FakeSourceState {
  calls: string[]
  maxInFlight: number
}

/** Fake BookSource: serves a blob of the book's size for fetchBook; other methods are unused here. */
function makeSource(opts: FakeSourceOptions = {}): { source: BookSource; state: FakeSourceState } {
  const state: FakeSourceState = { calls: [], maxInFlight: 0 }
  let inFlight = 0
  const fetchBook: BookSource['fetchBook'] = async (b, o = {}) => {
    state.calls.push(b.id)
    inFlight++
    state.maxInFlight = Math.max(state.maxInFlight, inFlight)
    try {
      await Promise.resolve()
      if (opts.hang) {
        await new Promise<never>((_, reject) => {
          const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
          if (o.signal?.aborted) abort()
          else o.signal?.addEventListener('abort', abort)
        })
      }
      for (const p of opts.pcts ?? [50, 100]) o.onProgress?.(p)
      const err = opts.fail?.(b.id)
      if (err) throw err
      return new Blob([new Uint8Array(b.size)])
    } finally {
      inFlight--
    }
  }
  const source = {
    fetchCatalog: async () => [],
    coverUrl: () => '',
    epubUrl: () => '',
    fetchBook,
  } as BookSource
  return { source, state }
}

function makeDeps(source: BookSource | null, over: Partial<CacheDeps> = {}): CacheDeps {
  return {
    db,
    source,
    online: () => true,
    now: () => NOW,
    persist: async () => true,
    ...over,
  }
}

describe('book-cache', () => {
  it('cache.fetch.first-read: downloads once, reports progress, stores md5 and modifiedTime, second open is cache-only', async () => {
    await seedBook(book('a', { size: 1_000_000, md5: 'm1', modifiedTime: T }))
    const { source, state } = makeSource({ pcts: [10, 40, 75, 100] })
    const pcts: (number | null)[] = []

    const first = await getBookFile(makeDeps(source), 'a', { onProgress: (p) => pcts.push(p) })

    expect(first.usedOld).toBe(false)
    expect(first.blob.size).toBe(1_000_000)
    expect(pcts).toEqual([10, 40, 75, 100])

    const row = await db.bookFiles.get('a')
    expect(row?.md5).toBe('m1')
    expect(row?.modifiedTime).toBe(T)
    expect(row?.size).toBe(1_000_000)

    const second = await getBookFile(makeDeps(source), 'a')
    expect(second.usedOld).toBe(false)
    expect(state.calls).toEqual(['a'])
  })

  it('cache.fetch.content-length: progress reported by the source (25) reaches the caller unchanged', async () => {
    await seedBook(book('a', { size: 0 }))
    const { source } = makeSource({ pcts: [25] })
    const pcts: (number | null)[] = []

    await getBookFile(makeDeps(source), 'a', { onProgress: (p) => pcts.push(p) })

    expect(pcts).toEqual([25])
  })

  it('cache.fetch.abort: aborting the signal rejects with AbortError and stores nothing', async () => {
    await seedBook(book('a'))
    const { source } = makeSource({ hang: true })
    const ctrl = new AbortController()

    const pending = getBookFile(makeDeps(source), 'a', { signal: ctrl.signal }).catch((e: unknown) => e)
    ctrl.abort()
    const err = await pending

    expect(err).not.toBeInstanceOf(CacheError)
    expect((err as Error).name).toBe('AbortError')
    expect(await db.bookFiles.get('a')).toBeUndefined()
  })

  it('cache.fetch.interrupted: network drop halfway stores nothing and reports kind network', async () => {
    await seedBook(book('a'))
    const { source } = makeSource({ fail: () => new SourceError('network') })

    const err = await getBookFile(makeDeps(source), 'a').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CacheError)
    expect((err as CacheError).kind).toBe('network')
    expect(await db.bookFiles.get('a')).toBeUndefined()
  })

  it('cache.fetch.not-found: a 404 from the source rejects with kind not-found and stores nothing', async () => {
    await seedBook(book('a'))
    const { source } = makeSource({ fail: () => new SourceError('not-found', 404) })

    const err = await getBookFile(makeDeps(source), 'a').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CacheError)
    expect((err as CacheError).kind).toBe('not-found')
    expect(await db.bookFiles.get('a')).toBeUndefined()
  })

  it('cache.fetch.quota: storing that throws QuotaExceededError reports kind quota', async () => {
    await seedBook(book('a'))
    const { source } = makeSource()
    vi.spyOn(db.bookFiles, 'put').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))

    const err = await getBookFile(makeDeps(source), 'a').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CacheError)
    expect((err as CacheError).kind).toBe('quota')
  })

  it('cache.fetch.offline: offline and not cached throws kind offline without a request', async () => {
    await seedBook(book('a'))
    const { source, state } = makeSource()

    const err = await getBookFile(makeDeps(source, { online: () => false }), 'a').catch((e: unknown) => e)

    expect((err as CacheError).kind).toBe('offline')
    expect(state.calls).toEqual([])
  })

  it('cache.persist.removed-from-drive: a cached book with inDrive 0 opens from the cache', async () => {
    await seedBook(book('a', { inDrive: 0, md5: 'm1' }))
    await seedFile('a', 'm1', T)
    const { source, state } = makeSource()

    const res = await getBookFile(makeDeps(source), 'a')

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
    const { source, state } = makeSource()
    expect((await listStaleIds(db)).sort()).toEqual(['a', 'b'])

    await refreshStale(makeDeps(source))

    expect(state.calls.sort()).toEqual(['a', 'b'])
    expect(state.maxInFlight).toBe(1)
    expect((await db.bookFiles.get('a'))?.md5).toBe('m2')
    expect((await db.bookFiles.get('b'))?.md5).toBe('m2')
    expect(await listStaleIds(db)).toEqual([])
  })

  it('cache.stale.resync: a catalog sync that changes a cached book makes refreshStale download it through the source', async () => {
    await upsertCatalog(db, [{ id: 'a', title: 'a', epub: 'a.epub', size: 1_000_000, md5: 'm1', updatedAt: new Date(T).toISOString() }], NOW)
    await seedFile('a', 'm1', T)
    expect(await listStaleIds(db)).toEqual([])

    // The next catalog lists a newer edition of "a" with another md5.
    await upsertCatalog(db, [{ id: 'a', title: 'a', epub: 'a.epub', size: 1_000_000, md5: 'm2', updatedAt: new Date(T + HOUR).toISOString() }], NOW + 1)
    expect(await listStaleIds(db)).toEqual(['a'])

    const { source, state } = makeSource()
    await refreshStale(makeDeps(source))

    expect(state.calls).toEqual(['a'])
    expect((await db.bookFiles.get('a'))?.md5).toBe('m2')
    expect(await listStaleIds(db)).toEqual([])
  })

  it('book-cache: refreshStale runs downloads serially', async () => {
    for (const id of ['a', 'b', 'c']) {
      await seedBook(book(id, { md5: 'm2', modifiedTime: T + HOUR }))
      await seedFile(id, 'm1', T)
    }
    const { source, state } = makeSource()

    await refreshStale(makeDeps(source))

    expect(state.calls).toHaveLength(3)
    expect(state.maxInFlight).toBe(1)
  })

  it('cache.stale.open-online: stale book opened online is downloaded, stored and returned', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { source, state } = makeSource()

    const res = await getBookFile(makeDeps(source), 'a')

    expect(res.usedOld).toBe(false)
    expect(res.md5).toBe('m2')
    expect(state.calls).toEqual(['a'])
    expect((await db.bookFiles.get('a'))?.md5).toBe('m2')
  })

  it('cache.stale.offline: stale book opened offline returns the old copy with usedOld true', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { source, state } = makeSource()

    const res = await getBookFile(makeDeps(source, { online: () => false }), 'a')

    expect(res.usedOld).toBe(true)
    expect(res.md5).toBe('m1')
    expect(state.calls).toEqual([])
  })

  it('cache.stale.refresh-fails: failed background refresh keeps the old blob and the book stays stale', async () => {
    await seedBook(book('a', { md5: 'm2', modifiedTime: T + HOUR }))
    await seedFile('a', 'm1', T)
    const { source } = makeSource({ fail: () => new SourceError('network') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(refreshStale(makeDeps(source))).resolves.toBeUndefined()

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

  it('cache.clear.local-only: deleting the cache of a local-only book removes it from books', async () => {
    await seedBook(book('c', { inDrive: 0 }))
    await seedFile('c')

    await deleteCache(db, 'c')

    expect(await db.books.get('c')).toBeUndefined()
    expect(await db.bookFiles.get('c')).toBeUndefined()
  })

  it('book-cache: persist is requested exactly once across two stores', async () => {
    vi.resetModules()
    const fresh = await import('../../src/cache/book-cache')
    const persist = vi.fn(async () => true)
    const deps: CacheDeps = { db, source: null, online: () => true, now: () => NOW, persist }
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
    const { source, state } = makeSource()

    const err = await getBookFile(makeDeps(source), 'missing').catch((e: unknown) => e)

    expect((err as CacheError).kind).toBe('not-found')
    expect(state.calls).toEqual([])
  })

  it('book-cache: cacheStats counts cached files and sums their sizes', async () => {
    await seedFile('a', 'm1', T, 10)
    await seedFile('b', 'm1', T, 25)

    const stats = await cacheStats(db)

    expect(stats.count).toBe(2)
    expect(stats.bytes).toBe(35)
    expect(stats).not.toHaveProperty('coversBytes')
  })
})
