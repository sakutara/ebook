import { deleteCache } from '../cache/book-cache'
import type { AppDB, Book, BookFile } from '../db/db'
import { showToast } from './toast-store'

/** How long "Hoàn tác" stays offered after a saved copy is removed. */
export const UNDO_MS = 6000

interface Snapshot {
  file?: BookFile
  book?: Book
}

/**
 * Removes saved copies right away (so a reload never brings them back) and offers "Hoàn tác":
 * the removed rows are kept in memory while the toast is up and put back on undo.
 */
export async function removeSavedCopies(
  db: AppDB,
  items: { id: string; title: string }[],
  ms = UNDO_MS,
): Promise<void> {
  if (items.length === 0) return
  const snaps: Snapshot[] = await Promise.all(
    items.map(async (it) => ({ file: await db.bookFiles.get(it.id), book: await db.books.get(it.id) })),
  )
  for (const it of items) await deleteCache(db, it.id)
  const text = items.length === 1 ? `Đã xoá bản lưu «${items[0].title}»` : `Đã xoá ${items.length} bản lưu`
  showToast(text, ms, { label: 'Hoàn tác', run: () => void restoreSnapshots(db, snaps) })
}

export function removeSavedCopy(db: AppDB, bookId: string, title: string, ms = UNDO_MS): Promise<void> {
  return removeSavedCopies(db, [{ id: bookId, title }], ms)
}

async function restoreSnapshots(db: AppDB, snaps: Snapshot[]): Promise<void> {
  await db.transaction('rw', db.bookFiles, db.books, async () => {
    for (const s of snaps) {
      if (s.book && !(await db.books.get(s.book.id))) await db.books.put(s.book)
      if (s.file) await db.bookFiles.put(s.file)
    }
  })
}
