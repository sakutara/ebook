import Dexie, { type EntityTable } from 'dexie'
import type { OutboxOp } from '../sync/outbox'

export interface Setting { key: string; value: unknown; updatedAt: number }

/** Fields every synced record carries. */
export interface SyncedRecord { id: string; updatedAt: number; deleted: 0 | 1 }

export interface Book {
  id: string; name: string; title: string; normTitle: string;
  author: string; normAuthor: string; genres: string[]; description: string; note?: string;
  size: number; modifiedTime: number; md5: string; inDrive: 0 | 1; lastSeenAt: number; updatedAt: number
}

export interface BookFile {
  bookId: string; blob: Blob; size: number; md5: string;
  modifiedTime: number; cachedAt: number; lastOpenedAt: number
}

/** id === bookId */
export interface Progress extends SyncedRecord {
  bookId: string; normTitle: string; cfi: string;
  snippet: string; sectionIndex: number; sectionHref: string; sectionFraction: number;
  fraction: number; bookMd5: string
}

/**
 * One request for a story to be added to the Google Form. `key` is `requestKey(title, author)`.
 * `originalTitle` and `language` are optional and may be absent on rows saved before they existed.
 */
export interface StoryRequest {
  id: string; key: string; title: string; author: string;
  originalTitle?: string; language?: string;
  createdAt: number; sentAt: number | null; updatedAt: number; deleted: 0
}

export class AppDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  outbox!: EntityTable<OutboxOp, 'id'>
  books!: EntityTable<Book, 'id'>
  bookFiles!: EntityTable<BookFile, 'bookId'>
  progress!: EntityTable<Progress, 'id'>
  storyRequests!: EntityTable<StoryRequest, 'id'>

  constructor(name = 'ebook') {
    super(name)
    // Never edit an old version block: add db.version(n+1) with .upgrade() and
    // record it in knowledge/data/<table>.md.
    this.version(1).stores({
      settings: 'key',
      outbox: 'id, createdAt',
    })
    this.version(2).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      books: 'id, normTitle, inDrive, lastSeenAt',
      bookFiles: 'bookId, cachedAt, lastOpenedAt',
      covers: 'bookId',
      progress: 'id, bookId, normTitle, updatedAt',
    })
    this.version(3).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      books: 'id, normTitle, inDrive, lastSeenAt',
      bookFiles: 'bookId, cachedAt, lastOpenedAt',
      covers: 'bookId',
      progress: 'id, bookId, normTitle, updatedAt',
      storyRequests: 'id, &key, createdAt',
    })
    this.version(4).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      books: 'id, normTitle, inDrive, lastSeenAt',
      bookFiles: 'bookId, cachedAt, lastOpenedAt',
      covers: null, // dropped
      progress: 'id, bookId, normTitle, updatedAt',
      storyRequests: 'id, &key, createdAt',
    }).upgrade((tx) =>
      tx.table('books').toCollection().modify((b) => {
        b.author ??= ''
        b.normAuthor ??= ''
        b.genres ??= []
        b.description ??= ''
      }),
    )
  }
}

export const db = new AppDB()

export const newId = () => crypto.randomUUID()
export const now = () => Date.now()
