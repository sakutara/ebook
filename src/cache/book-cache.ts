import type { AppDB, Book, BookFile } from '../db/db'
import { SourceError, type BookSource } from '../source/r2-source'
import { requestPersistence } from '../data/backup'

export type CacheErrorKind = 'offline' | 'network' | 'quota' | 'not-found'

export class CacheError extends Error {
  readonly kind: CacheErrorKind

  constructor(kind: CacheErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'CacheError'
    this.kind = kind
  }
}

export interface GetResult {
  blob: Blob
  md5: string
  usedOld: boolean
}

export interface CacheDeps {
  db: AppDB
  source: BookSource | null
  online?: () => boolean
  now?: () => number
  persist?: () => Promise<boolean>
}

const PERSIST_KEY = 'storage.persistRequested'
const defaultOnline = () => navigator.onLine

/** A cached copy is stale when the catalog has a newer version of the book. */
export function isStale(book: Book | undefined, file: BookFile): boolean {
  return (
    !!book &&
    book.inDrive === 1 &&
    !!book.md5 &&
    book.md5 !== file.md5 &&
    book.modifiedTime > file.modifiedTime
  )
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

function isQuotaError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError'
}

/** Ask for persistent storage once per session, unless it was already requested. */
let persistAsked = false
async function requestPersistOnce(deps: CacheDeps): Promise<void> {
  if (persistAsked) return
  persistAsked = true
  if (await deps.db.settings.get(PERSIST_KEY)) return
  try {
    await (deps.persist ?? requestPersistence)()
  } catch {
    // Best effort: a failed persist request must not fail the store.
  }
  await deps.db.settings.put({
    key: PERSIST_KEY,
    value: true,
    updatedAt: (deps.now ?? Date.now)(),
  })
}

export async function storeBookFile(deps: CacheDeps, book: Book, blob: Blob): Promise<BookFile> {
  const t = (deps.now ?? Date.now)()
  const row: BookFile = {
    bookId: book.id,
    blob,
    size: blob.size,
    md5: book.md5,
    modifiedTime: book.modifiedTime,
    cachedAt: t,
    lastOpenedAt: t,
  }
  try {
    await deps.db.bookFiles.put(row)
  } catch (e) {
    if (isQuotaError(e)) throw new CacheError('quota')
    throw e
  }
  await requestPersistOnce(deps)
  return row
}

/** Download a book through the source and store it; maps failures to CacheError kinds. */
async function download(
  deps: CacheDeps,
  source: BookSource,
  book: Book,
  opts: { onProgress?: (pct: number | null) => void; signal?: AbortSignal } = {},
): Promise<BookFile> {
  let blob: Blob
  try {
    blob = await source.fetchBook(book, { onProgress: opts.onProgress, signal: opts.signal })
  } catch (e) {
    if (isAbortError(e)) throw e
    if (e instanceof SourceError && e.kind === 'not-found') throw new CacheError('not-found')
    throw new CacheError('network')
  }
  return storeBookFile(deps, book, blob)
}

export async function getBookFile(
  deps: CacheDeps,
  bookId: string,
  opts: { onProgress?: (pct: number | null) => void; signal?: AbortSignal } = {},
): Promise<GetResult> {
  const online = deps.online ?? defaultOnline
  const now = deps.now ?? Date.now
  const { db, source } = deps
  const file = await db.bookFiles.get(bookId)
  const book = await db.books.get(bookId)

  const hit = async (f: BookFile, usedOld: boolean): Promise<GetResult> => {
    await db.bookFiles.update(bookId, { lastOpenedAt: now() })
    return { blob: f.blob, md5: f.md5, usedOld }
  }

  if (file) {
    if (!book || !isStale(book, file)) return hit(file, false)
    if (online() && source) {
      try {
        const fresh = await download(deps, source, book, opts)
        return { blob: fresh.blob, md5: fresh.md5, usedOld: false }
      } catch {
        // Fall through: keep serving the old copy.
      }
    }
    return hit(file, true)
  }

  if (!online() || !source) throw new CacheError('offline')
  if (!book) throw new CacheError('not-found')
  const stored = await download(deps, source, book, opts)
  return { blob: stored.blob, md5: stored.md5, usedOld: false }
}

export async function listStaleIds(db: AppDB): Promise<string[]> {
  const files = await db.bookFiles.toArray()
  const books = await db.books.bulkGet(files.map((f) => f.bookId))
  const ids: string[] = []
  files.forEach((f, i) => {
    if (isStale(books[i], f)) ids.push(f.bookId)
  })
  return ids
}

let refreshing: Promise<void> | null = null

/** Re-download every stale book, one at a time. Concurrent calls share one run. */
export function refreshStale(deps: CacheDeps): Promise<void> {
  if (!refreshing) {
    refreshing = runRefresh(deps).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function runRefresh(deps: CacheDeps): Promise<void> {
  const online = deps.online ?? defaultOnline
  const source = deps.source
  if (!online() || !source) return
  for (const id of await listStaleIds(deps.db)) {
    const book = await deps.db.books.get(id)
    if (!book) continue
    try {
      await download(deps, source, book)
    } catch (e) {
      console.warn(`book-cache: refresh failed for ${id}`, e)
    }
  }
}

/** Remove a book's local-only row once its cache is gone and it has no live position. */
async function dropIfLocalOnly(db: AppDB, bookId: string): Promise<void> {
  const b = await db.books.get(bookId)
  if (!b || b.inDrive !== 0) return
  const progress = await db.progress.get(bookId)
  if (progress && progress.deleted === 0) return
  await db.books.delete(bookId)
}

export async function deleteCache(db: AppDB, bookId: string): Promise<void> {
  await db.transaction('rw', db.bookFiles, db.books, db.progress, async () => {
    await db.bookFiles.delete(bookId)
    await dropIfLocalOnly(db, bookId)
  })
}

export async function deleteAllCache(db: AppDB): Promise<void> {
  await db.transaction('rw', db.bookFiles, db.books, db.progress, async () => {
    const ids = (await db.bookFiles.toArray()).map((f) => f.bookId)
    await db.bookFiles.clear()
    for (const id of ids) await dropIfLocalOnly(db, id)
  })
}

export async function cacheStats(
  db: AppDB,
): Promise<{ count: number; bytes: number }> {
  const files = await db.bookFiles.toArray()
  return {
    count: files.length,
    bytes: files.reduce((sum, f) => sum + f.size, 0),
  }
}
