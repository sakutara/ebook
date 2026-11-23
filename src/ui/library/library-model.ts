import type { Book, BookFile, Progress } from '../../db/db'
import { isStale } from '../../cache/book-cache'
import { matchesQuery } from '../../domain/title'

export interface CardModel {
  book: Book
  cached: boolean
  stale: boolean
  localOnly: boolean
  fraction?: number
}

/**
 * Builds the library cards. A book is visible when it is still in Drive or has a cached file.
 * Sorted by normTitle, filtered by the "saved" (cached) filter and by the search query.
 */
export function buildCards(
  books: Book[],
  files: Pick<BookFile, 'bookId' | 'md5' | 'modifiedTime'>[],
  progress: Pick<Progress, 'bookId' | 'fraction' | 'deleted'>[],
  q: string,
  f: 'all' | 'saved',
): CardModel[] {
  const fileById = new Map(files.map((x) => [x.bookId, x]))
  const fractionById = new Map(
    progress.filter((p) => p.deleted === 0).map((p) => [p.bookId, p.fraction] as const),
  )

  return books
    .map((book) => {
      const file = fileById.get(book.id)
      const cached = file !== undefined
      // isStale only reads md5 and modifiedTime, so the file projection is sufficient.
      const stale = cached && isStale(book, file as BookFile)
      return {
        book,
        cached,
        stale,
        localOnly: book.inDrive === 0,
        fraction: fractionById.get(book.id),
      }
    })
    .filter((c) => c.cached || c.book.inDrive === 1)
    .filter((c) => f === 'all' || c.cached)
    .filter((c) => matchesQuery(c.book.normTitle, q))
    .sort((a, b) => a.book.normTitle.localeCompare(b.book.normTitle) || a.book.id.localeCompare(b.book.id))
}
