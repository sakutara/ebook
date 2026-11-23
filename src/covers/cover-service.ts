import type { AppDB, Book } from '../db/db'
import type { DriveApi } from '../drive/drive-api'
import { DriveRangeReader } from '../drive/range-reader'
import { extractCover } from './extract-cover'
import { downscale } from './downscale'

export interface CoverDeps {
  db: AppDB
  api: DriveApi | null
  online?: () => boolean
  extract?: typeof extractCover
  shrink?: (b: Blob) => Promise<Blob>
  now?: () => number
  concurrency?: number
}

export type CoverBook = Pick<Book, 'id' | 'md5' | 'size'>

export interface CoverService {
  /** Resolves the cover blob, null when the book has none, or undefined when unavailable. */
  get(book: CoverBook): Promise<Blob | null | undefined>
}

export function createCoverService(deps: CoverDeps): CoverService {
  const { db, api } = deps
  const online = deps.online ?? (() => navigator.onLine)
  const extract = deps.extract ?? extractCover
  const shrink = deps.shrink ?? ((b: Blob) => downscale(b))
  const now = deps.now ?? (() => Date.now())
  const limit = deps.concurrency ?? 3

  // FIFO semaphore: at most `limit` extractions in flight.
  let active = 0
  const waiting: Array<() => void> = []
  const acquire = (): Promise<void> => {
    if (active < limit) {
      active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => waiting.push(resolve))
  }
  const release = (): void => {
    active--
    const next = waiting.shift()
    if (next) {
      active++
      next()
    }
  }
  const runExtract = async (input: Blob | DriveRangeReader): Promise<Blob | null> => {
    await acquire()
    try {
      return await extract(input)
    } finally {
      release()
    }
  }

  const inflight = new Map<string, Promise<Blob | null | undefined>>()

  const load = async (book: CoverBook): Promise<Blob | null | undefined> => {
    const row = await db.covers.get(book.id)
    if (row && row.md5 === book.md5) return row.blob

    const file = await db.bookFiles.get(book.id)
    let input: Blob | DriveRangeReader
    if (file) input = file.blob
    else if (online() && api) input = new DriveRangeReader(api, book.id, book.size)
    else return undefined

    let blob: Blob | null
    try {
      const cover = await runExtract(input)
      blob = cover ? await shrink(cover) : null
    } catch {
      return undefined
    }
    await db.covers.put({ bookId: book.id, blob, md5: book.md5, fetchedAt: now() })
    return blob
  }

  return {
    get(book) {
      const existing = inflight.get(book.id)
      if (existing) return existing
      const p = load(book).finally(() => inflight.delete(book.id))
      inflight.set(book.id, p)
      return p
    },
  }
}
