import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import { exportData } from '../../src/data/backup'

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

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof (blob as Blob & { text?: unknown }).text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('db.v2', () => {
  it('db.v2: tables and indexes match the design', async () => {
    const db = await newDb()
    expect(db.verno).toBeGreaterThanOrEqual(2)

    const expected: Record<string, { primKey: string; indexes: string[] }> = {
      settings: { primKey: 'key', indexes: [] },
      outbox: { primKey: 'id', indexes: ['createdAt'] },
      books: { primKey: 'id', indexes: ['inDrive', 'lastSeenAt', 'normTitle'] },
      bookFiles: { primKey: 'bookId', indexes: ['cachedAt', 'lastOpenedAt'] },
      covers: { primKey: 'bookId', indexes: [] },
      progress: { primKey: 'id', indexes: ['bookId', 'normTitle', 'updatedAt'] },
    }

    for (const [name, want] of Object.entries(expected)) {
      const table = db.table(name)
      expect(table.schema.primKey.name, `primKey of ${name}`).toBe(want.primKey)
      expect(
        table.schema.indexes.map((i) => i.name).sort(),
        `indexes of ${name}`,
      ).toEqual(want.indexes)
    }
  })

  it('db.v2: upgrade from v1 keeps settings rows', async () => {
    const name = freshName()

    const v1 = new Dexie(name)
    v1.version(1).stores({ settings: 'key', outbox: 'id, createdAt' })
    await v1.open()
    await v1.table('settings').put({ key: 'x', value: 1, updatedAt: 1 })
    v1.close()

    const db = await newDb(name)
    expect(db.verno).toBeGreaterThanOrEqual(2)
    expect(await db.settings.get('x')).toEqual({ key: 'x', value: 1, updatedAt: 1 })
  })

  it('progress.backup.roundtrip: export skips books, bookFiles and covers', async () => {
    const db = await newDb()
    await db.books.put({
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
    await db.bookFiles.put({
      bookId: 'b1',
      blob: new Blob(['x']),
      size: 1,
      md5: 'm',
      modifiedTime: 1,
      cachedAt: 1,
      lastOpenedAt: 1,
    })
    await db.covers.put({ bookId: 'b1', blob: null, md5: 'm', fetchedAt: 1 })
    await db.progress.put({
      id: 'b1',
      bookId: 'b1',
      normTitle: 'a',
      cfi: 'epubcfi(/6/2)',
      snippet: 's',
      sectionIndex: 0,
      sectionHref: 'c1.xhtml',
      sectionFraction: 0.5,
      fraction: 0.25,
      bookMd5: 'm',
      updatedAt: 1,
      deleted: 0,
    })
    await db.settings.put({ key: 'theme', value: 'dark', updatedAt: 1 })

    const blob = await exportData(db)
    const doc = JSON.parse(await readBlobText(blob)) as { tables: Record<string, unknown[]> }

    expect(Object.keys(doc.tables)).toContain('progress')
    expect(Object.keys(doc.tables)).toContain('settings')
    expect(doc.tables).not.toHaveProperty('books')
    expect(doc.tables).not.toHaveProperty('bookFiles')
    expect(doc.tables).not.toHaveProperty('covers')
    expect(doc.tables).not.toHaveProperty('outbox')
  })
})
