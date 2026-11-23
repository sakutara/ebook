import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, type BookFile, type Cover } from '../../src/db/db'
import { createCoverService, type CoverDeps } from '../../src/covers/cover-service'

const NOW = 1_700_000_000_000
const BOOK_A = { id: 'a', md5: 'md5-a', size: 100 }
const BOOK_B = { id: 'b', md5: 'md5-b', size: 200 }

let db: AppDB

beforeEach(() => {
  db = new AppDB('t-' + crypto.randomUUID())
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.delete()
})

function makeService(over: Partial<CoverDeps> = {}) {
  const extract =
    over.extract ?? vi.fn(async (_input: unknown): Promise<Blob | null> => new Blob(['cover']))
  const deps: CoverDeps = {
    db,
    extract,
    shrink: async (b: Blob) => b,
    now: () => NOW,
    concurrency: 3,
    ...over,
  }
  return { service: createCoverService(deps), extract, deps }
}

const bookFile = (bookId: string, md5: string): BookFile => ({
  bookId,
  blob: new Blob(['epub-bytes']),
  size: 10,
  md5,
  modifiedTime: 0,
  cachedAt: NOW,
  lastOpenedAt: NOW,
})

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

describe('cover service', () => {
  it('library.cover.cached: returns the stored cover without extraction', async () => {
    await db.bookFiles.put(bookFile('a', BOOK_A.md5))
    const stored = new Blob(['stored-cover'])
    const row: Cover = { bookId: 'a', blob: stored, md5: BOOK_A.md5, fetchedAt: NOW }
    await db.covers.put(row)
    const { service, extract } = makeService()

    const result = await service.get(BOOK_A)

    expect(result).toEqual(await db.covers.get('a').then((r) => r?.blob))
    expect(extract).not.toHaveBeenCalled()
  })

  it('library.cover.uncached: returns undefined and never reads Drive when the book is not cached', async () => {
    const { service, extract } = makeService()

    const result = await service.get(BOOK_B)

    expect(result).toBeUndefined()
    expect(extract).not.toHaveBeenCalled()
    expect(await db.covers.get('b')).toBeUndefined()
  })

  it('library.cover.none: stores a null blob with md5 and returns null when the EPUB has no cover', async () => {
    await db.bookFiles.put(bookFile('a', BOOK_A.md5))
    const { service, extract } = makeService({ extract: vi.fn(async () => null) })

    const result = await service.get(BOOK_A)

    expect(result).toBeNull()
    expect(extract).toHaveBeenCalledTimes(1)
    const row = await db.covers.get('a')
    expect(row).toBeDefined()
    expect(row?.blob).toBeNull()
    expect(row?.md5).toBe(BOOK_A.md5)
    expect(row?.fetchedAt).toBe(NOW)
  })

  it('library.cover.lazy: never runs more than 3 extractions at a time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const resolvers: Array<() => void> = []
    const extract = vi.fn(
      () =>
        new Promise<Blob | null>((resolve) => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          resolvers.push(() => {
            inFlight--
            resolve(new Blob(['c']))
          })
        }),
    )
    const { service } = makeService({ extract, concurrency: 3 })
    const books = Array.from({ length: 8 }, (_, i) => ({ id: `book-${i}`, md5: `m${i}`, size: 1 }))
    await db.bookFiles.bulkPut(books.map((b) => bookFile(b.id, b.md5)))

    const pending = books.map((b) => service.get(b))

    await vi.waitFor(() => expect(resolvers.length).toBe(3))
    await tick()
    expect(extract).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(3)

    let done = 0
    while (done < 8) {
      await vi.waitFor(() => expect(resolvers.length).toBeGreaterThan(0))
      resolvers.shift()!()
      done++
      await tick()
    }

    const results = await Promise.all(pending)
    expect(results.every((r) => r instanceof Blob)).toBe(true)
    expect(extract).toHaveBeenCalledTimes(8)
    expect(maxInFlight).toBe(3)
  })

  it('cover-service: md5 mismatch re-extracts', async () => {
    await db.bookFiles.put(bookFile('a', BOOK_A.md5))
    await db.covers.put({ bookId: 'a', blob: null, md5: 'old-md5', fetchedAt: 1 })
    const { service, extract } = makeService()

    const result = await service.get(BOOK_A)

    expect(result).toBeInstanceOf(Blob)
    expect(extract).toHaveBeenCalledTimes(1)
    const row = await db.covers.get('a')
    expect(row?.md5).toBe(BOOK_A.md5)
    expect(row?.fetchedAt).toBe(NOW)
  })

  it('cover-service: extracts from the cached book file blob', async () => {
    const file = bookFile('a', BOOK_A.md5)
    await db.bookFiles.put(file)
    const { service, extract } = makeService()

    await service.get(BOOK_A)

    expect(extract).toHaveBeenCalledTimes(1)
    expect(extract.mock.calls[0][0]).toBeDefined()
  })

  it('cover-service: extraction error returns undefined and stores nothing', async () => {
    const extract = vi.fn(async () => {
      throw new Error('corrupt zip')
    })
    await db.bookFiles.put(bookFile('a', BOOK_A.md5))
    const { service } = makeService({ extract })

    const result = await service.get(BOOK_A)

    expect(result).toBeUndefined()
    expect(await db.covers.get('a')).toBeUndefined()
  })

  it('cover-service: duplicate gets share one extraction', async () => {
    await db.bookFiles.put(bookFile('a', BOOK_A.md5))
    const { service, extract } = makeService()

    const [x, y] = await Promise.all([service.get(BOOK_A), service.get(BOOK_A)])

    expect(extract).toHaveBeenCalledTimes(1)
    expect(x).toBe(y)
  })
})
