import type { AppDB, Book } from '../db/db'
import { normalize, titleFromName } from '../domain/title'
import { copyProgress, getProgress } from '../progress/progress-repo'

/** Minimal shape of a Drive file listing entry consumed by the catalog. */
export interface DriveFileLike {
  id: string
  name: string
  size?: string
  modifiedTime: string
  md5Checksum?: string
}

/**
 * Store one page of Drive listing results. Only .epub files are kept.
 * Returns the ids that had no books row before this call.
 * The books table is a local cache: writes here are not queued to the outbox.
 */
export async function upsertPage(
  db: AppDB,
  files: DriveFileLike[],
  syncStartedAt: number,
): Promise<{ newIds: string[] }> {
  const epubs = files.filter((f) => /\.epub$/i.test(f.name))
  const rows: Book[] = epubs.map((f) => {
    const title = titleFromName(f.name)
    return {
      id: f.id,
      name: f.name,
      title,
      normTitle: normalize(title),
      size: parseInt(f.size ?? '0', 10) || 0,
      modifiedTime: Date.parse(f.modifiedTime) || 0,
      md5: f.md5Checksum ?? '',
      inDrive: 1,
      lastSeenAt: syncStartedAt,
      updatedAt: syncStartedAt,
    }
  })

  let newIds: string[] = []
  await db.transaction('rw', db.books, async () => {
    const existing = await db.books.bulkGet(rows.map((r) => r.id))
    newIds = rows.filter((_, i) => existing[i] === undefined).map((r) => r.id)
    await db.books.bulkPut(rows)
  })
  return { newIds }
}

/**
 * After a complete sync: books not seen in this sync are either kept (marked inDrive 0)
 * when they are cached or have a live position, or deleted together with their cover.
 */
export async function reconcile(db: AppDB, syncStartedAt: number): Promise<void> {
  await db.transaction('rw', db.books, db.bookFiles, db.covers, db.progress, async () => {
    const stale = await db.books.where('lastSeenAt').below(syncStartedAt).toArray()
    for (const book of stale) {
      const cached = (await db.bookFiles.get(book.id)) !== undefined
      const pos = await db.progress.get(book.id)
      const hasPosition = pos !== undefined && pos.deleted === 0
      if (cached || hasPosition) {
        await db.books.put({ ...book, inDrive: 0, updatedAt: syncStartedAt })
      } else {
        await db.books.delete(book.id)
        await db.covers.delete(book.id)
      }
    }
  })
}

/**
 * For each newly listed book without a position, adopt the position of a vanished
 * (or no longer in Drive) book with the same normalised title. Most recently updated wins.
 */
export async function reattachProgress(db: AppDB, newIds: string[]): Promise<void> {
  for (const id of newIds) {
    const book = await db.books.get(id)
    if (!book) continue
    if (await getProgress(db, id)) continue

    const sameTitle = (await db.progress.where('normTitle').equals(book.normTitle).toArray())
      .filter((p) => p.deleted === 0 && p.bookId !== id)

    let best: { bookId: string; updatedAt: number } | undefined
    for (const cand of sameTitle) {
      const oldBook = await db.books.get(cand.bookId)
      const gone = oldBook === undefined || oldBook.inDrive === 0
      if (!gone) continue
      if (!best || cand.updatedAt > best.updatedAt) {
        best = { bookId: cand.bookId, updatedAt: cand.updatedAt }
      }
    }
    if (best) await copyProgress(db, best.bookId, id)
  }
}
