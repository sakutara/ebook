import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'

const opened: AppDB[] = []

function freshName() {
  return 't-' + crypto.randomUUID()
}

async function newDb(name = freshName()) {
  const db = new AppDB(name)
  opened.push(db)
  await db.open()
  return db
}

/** Raw Dexie v3 schema, copied from the shipped v3 block, to seed a pre-v4 database. */
function openV3(name: string) {
  const v3 = new Dexie(name)
  v3.version(1).stores({ settings: 'key', outbox: 'id, createdAt' })
  v3.version(2).stores({
    settings: 'key',
    outbox: 'id, createdAt',
    books: 'id, normTitle, inDrive, lastSeenAt',
    bookFiles: 'bookId, cachedAt, lastOpenedAt',
    covers: 'bookId',
    progress: 'id, bookId, normTitle, updatedAt',
  })
  v3.version(3).stores({
    settings: 'key',
    outbox: 'id, createdAt',
    books: 'id, normTitle, inDrive, lastSeenAt',
    bookFiles: 'bookId, cachedAt, lastOpenedAt',
    covers: 'bookId',
    progress: 'id, bookId, normTitle, updatedAt',
    storyRequests: 'id, &key, createdAt',
  })
  return v3
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('db.v4', () => {
  it('catalog.sync.fields: v3 books row gains author, normAuthor, genres and description on upgrade', async () => {
    const name = freshName()
    const v3 = openV3(name)
    await v3.open()
    await v3.table('books').put({
      id: 'b1',
      name: 'a.epub',
      title: 'A',
      normTitle: 'a',
      size: 1,
      modifiedTime: 1,
      md5: 'm',
      inDrive: 1,
      lastSeenAt: 1,
      updatedAt: 1,
    })
    v3.close()

    const db = await newDb(name)
    expect(db.verno).toBe(4)

    const row = await db.books.get('b1')
    expect(row).toBeDefined()
    expect(row).toMatchObject({
      id: 'b1',
      title: 'A',
      author: '',
      normAuthor: '',
      genres: [],
      description: '',
    })
  })

  it('catalog.sync.fields: v4 database has no covers table', async () => {
    const db = await newDb()

    expect(db.tables.map((t) => t.name)).not.toContain('covers')
    expect(db.verno).toBe(4)
  })
})
