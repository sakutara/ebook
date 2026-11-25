import type { AppDB, Book } from '../db/db'
import { normalize } from '../domain/title'
import { copyProgress, getProgress } from '../progress/progress-repo'
import type { CatalogEntry } from '../source/r2-source'

/** Keeps only non-empty strings, trimmed. Anything else is dropped. */
function cleanGenres(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const g of raw) {
    if (typeof g !== 'string') continue
    const t = g.trim()
    if (t !== '') out.push(t)
  }
  return out
}

/** Maps one catalog entry to a books row. Optional fields are sanitised here: the source does not check them. */
function toBookRow(e: CatalogEntry, syncStartedAt: number): Book {
  const title = e.title.trim()
  const author = typeof e.author === 'string' ? e.author.trim() : ''
  return {
    id: e.id,
    name: e.epub,
    title,
    normTitle: normalize(title),
    author,
    normAuthor: normalize(author),
    genres: cleanGenres(e.genres),
    description: typeof e.description === 'string' ? e.description : '',
    ...(typeof e.chapters === 'number' && e.chapters > 0 ? { chapters: Math.floor(e.chapters) } : {}),
    ...(typeof e.note === 'string' && e.note.trim() !== '' ? { note: e.note.trim() } : {}),
    size: e.size,
    modifiedTime: typeof e.updatedAt === 'string' ? Date.parse(e.updatedAt) || 0 : 0,
    md5: e.md5,
    inDrive: 1,
    lastSeenAt: syncStartedAt,
    updatedAt: syncStartedAt,
  }
}

/**
 * Store the catalog returned by the source, in one transaction. Only ids that had no books row
 * before this call are reported in newIds.
 * The books table is a local cache: writes here are not queued to the outbox.
 */
export async function upsertCatalog(
  db: AppDB,
  entries: CatalogEntry[],
  syncStartedAt: number,
): Promise<{ newIds: string[] }> {
  const rows = entries.map((e) => toBookRow(e, syncStartedAt))

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
 * when they are cached or have a live position, or deleted.
 */
export async function reconcile(db: AppDB, syncStartedAt: number): Promise<void> {
  await db.transaction('rw', db.books, db.bookFiles, db.progress, async () => {
    const stale = await db.books.where('lastSeenAt').below(syncStartedAt).toArray()
    for (const book of stale) {
      const cached = (await db.bookFiles.get(book.id)) !== undefined
      const pos = await db.progress.get(book.id)
      const hasPosition = pos !== undefined && pos.deleted === 0
      if (cached || hasPosition) {
        await db.books.put({ ...book, inDrive: 0, updatedAt: syncStartedAt })
      } else {
        await db.books.delete(book.id)
      }
    }
  })
}

/**
 * Step 1: a gone book (inDrive 0) whose cached file has the same md5 hands its file and
 * position over to the new id. The old file, position and row are removed locally; the
 * position rename is not queued to the outbox. Returns false when no gone book matches.
 */
async function reattachByFile(db: AppDB, book: Book, now: number): Promise<boolean> {
  if (book.md5 === '') return false
  let moved = false
  await db.transaction('rw', db.books, db.bookFiles, db.progress, db.outbox, async () => {
    const gone = await db.books.where('inDrive').equals(0).toArray()
    const files = await db.bookFiles.bulkGet(gone.map((g) => g.id))
    const matches = gone
      .map((g, i) => ({ id: g.id, file: files[i] }))
      .filter((m) => m.file !== undefined && m.file.md5 === book.md5)
      .sort((a, b) => (b.file?.lastOpenedAt ?? 0) - (a.file?.lastOpenedAt ?? 0))
    const old = matches[0]
    if (!old?.file) return

    await db.bookFiles.put({ ...old.file, bookId: book.id, modifiedTime: book.modifiedTime })
    await db.bookFiles.delete(old.id)

    const oldPos = await getProgress(db, old.id)
    const newPos = await getProgress(db, book.id)
    if (oldPos && !newPos) await copyProgress(db, old.id, book.id, now)
    await db.progress.delete(old.id)
    await db.books.delete(old.id)
    moved = true
  })
  return moved
}

/**
 * Step 2: when the new id has no position, adopt the position of a gone (or missing) book with the
 * same normalised title. Most recently updated wins.
 */
async function reattachByTitle(db: AppDB, book: Book, now: number): Promise<void> {
  if (await getProgress(db, book.id)) return

  const sameTitle = (await db.progress.where('normTitle').equals(book.normTitle).toArray()).filter(
    (p) => p.deleted === 0 && p.bookId !== book.id,
  )

  let best: { bookId: string; updatedAt: number } | undefined
  for (const cand of sameTitle) {
    const oldBook = await db.books.get(cand.bookId)
    const gone = oldBook === undefined || oldBook.inDrive === 0
    if (!gone) continue
    if (!best || cand.updatedAt > best.updatedAt) {
      best = { bookId: cand.bookId, updatedAt: cand.updatedAt }
    }
  }
  if (best) await copyProgress(db, best.bookId, book.id, now)
}

/**
 * For each id stored by a sync that had no row before (in order): first try to take over a gone
 * book's cached file with the same md5 (step 1); otherwise copy a position by normalised title (step 2).
 */
export async function reattach(db: AppDB, newIds: string[], now: number): Promise<void> {
  for (const id of newIds) {
    const book = await db.books.get(id)
    if (!book) continue
    if (await reattachByFile(db, book, now)) continue
    await reattachByTitle(db, book, now)
  }
}
