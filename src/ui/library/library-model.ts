import type { Book, BookFile, Progress } from '../../db/db'
import { isStale } from '../../cache/book-cache'
import { matchesQuery } from '../../domain/title'
import { genreKey } from '../../domain/genre'

export interface CardModel {
  book: Book
  cached: boolean
  stale: boolean
  localOnly: boolean
  fraction?: number
}

export interface CardFilters {
  q: string
  saved: boolean
  /** Genre key (see genreKey); '' = all. */
  genre: string
  /** normAuthor; '' = all. */
  author: string
  /** Default 'newest'. */
  sort?: SortMode
}

export type SortMode = 'newest' | 'az'

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

export interface Option {
  value: string
  label: string
  count: number
}

type FileMeta = Pick<BookFile, 'bookId' | 'md5' | 'modifiedTime'>

/** A book is visible when it is still in Drive or has a cached file. */
function isListable(book: Book, cachedIds: Set<string>): boolean {
  return cachedIds.has(book.id) || book.inDrive === 1
}

/** Genre options: most books first; ties by key. Empty genres are omitted. */
export function genreOptions(books: Book[], cachedIds: Set<string>): Option[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const book of books) {
    if (!isListable(book, cachedIds)) continue
    const seenInBook = new Set<string>()
    for (const name of book.genres) {
      const key = genreKey(name)
      if (key === '' || seenInBook.has(key)) continue
      seenInBook.add(key)
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { label: name, count: 1 })
    }
  }
  return [...counts.entries()]
    .map(([value, e]) => ({ value, label: e.label, count: e.count }))
    .sort((x, y) => y.count - x.count || (x.value < y.value ? -1 : x.value > y.value ? 1 : 0))
}

/** Author options: non-empty normAuthor values among listable books, most books first; ties by value. */
export function authorOptions(books: Book[], cachedIds: Set<string>): Option[] {
  const byValue = new Map<string, { label: string; count: number }>()
  for (const book of books) {
    if (!isListable(book, cachedIds) || book.normAuthor === '') continue
    const entry = byValue.get(book.normAuthor)
    if (entry) entry.count += 1
    else byValue.set(book.normAuthor, { label: book.author, count: 1 })
  }
  return [...byValue.entries()]
    .map(([value, e]) => ({ value, label: e.label, count: e.count }))
    .sort((x, y) => y.count - x.count || (x.value < y.value ? -1 : x.value > y.value ? 1 : 0))
}

/**
 * Builds the library cards. A book is visible when it is still in Drive or has a cached file.
 * Sorted newest first by default, or by normTitle. Search runs over normTitle + normAuthor; genre and author filter values
 * without a matching option are ignored (treated as all).
 */
export function buildCards(
  books: Book[],
  files: FileMeta[],
  progress: Pick<Progress, 'bookId' | 'fraction' | 'deleted'>[],
  filters: CardFilters,
): CardModel[] {
  const fileById = new Map(files.map((x) => [x.bookId, x]))
  const cachedIds = new Set(fileById.keys())
  const fractionById = new Map(
    progress.filter((p) => p.deleted === 0).map((p) => [p.bookId, p.fraction] as const),
  )
  const genre = genreOptions(books, cachedIds).some((o) => o.value === filters.genre) ? filters.genre : ''
  const author = authorOptions(books, cachedIds).some((o) => o.value === filters.author) ? filters.author : ''

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
    .filter((c) => !filters.saved || c.cached)
    .filter((c) => genre === '' || c.book.genres.some((g) => genreKey(g) === genre))
    .filter((c) => author === '' || c.book.normAuthor === author)
    .filter((c) => matchesQuery(`${c.book.normTitle} ${c.book.normAuthor}`, filters.q))
    .sort((a, b) => compareCards(a, b, filters.sort ?? 'newest'))
}

/** 'newest': latest EPUB time (modifiedTime) first; 'az': by normTitle. Ties fall back to title, then id. */
function compareCards(a: CardModel, b: CardModel, sort: SortMode): number {
  const byTitle = a.book.normTitle.localeCompare(b.book.normTitle) || a.book.id.localeCompare(b.book.id)
  if (sort === 'az') return byTitle
  return b.book.modifiedTime - a.book.modifiedTime || byTitle
}

/** Splits cards (already sorted newest first) into those added within a day and, separately, within a week. */
export function splitRecent(cards: CardModel[], now: number): { day: CardModel[]; week: CardModel[] } {
  const day: CardModel[] = []
  const week: CardModel[] = []
  for (const c of cards) {
    const age = now - c.book.modifiedTime
    if (c.book.modifiedTime <= 0 || age > WEEK_MS) continue
    if (age <= DAY_MS) day.push(c)
    else week.push(c)
  }
  const byTime = (a: CardModel, b: CardModel) => b.book.modifiedTime - a.book.modifiedTime
  return { day: day.sort(byTime), week: week.sort(byTime) }
}
