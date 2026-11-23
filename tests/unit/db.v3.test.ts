import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { AppDB, type StoryRequest } from '../../src/db/db'
import { exportData, importData } from '../../src/data/backup'

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

function request(id: string, key: string, overrides: Partial<StoryRequest> = {}): StoryRequest {
  return {
    id,
    key,
    title: 'Phàm Nhân Tu Tiên',
    author: 'Vong Ngữ',
    createdAt: 1,
    sentAt: null,
    updatedAt: 1,
    deleted: 0,
    ...overrides,
  }
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('db.v3', () => {
  it('story-request.backup.roundtrip: db is at version 3 with storyRequests(id, &key, createdAt)', async () => {
    const db = await newDb()
    expect(db.verno).toBe(4)

    const table = db.table('storyRequests')
    expect(table.schema.primKey.name).toBe('id')
    const indexes = table.schema.indexes.map((i) => ({ name: i.name, unique: i.unique })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    expect(indexes).toEqual([
      { name: 'createdAt', unique: false },
      { name: 'key', unique: true },
    ])
  })

  it('story-request.backup.roundtrip: v2 DB with a progress row opens at v3 with the row intact', async () => {
    const name = freshName()

    const v2 = new Dexie(name)
    v2.version(1).stores({ settings: 'key', outbox: 'id, createdAt' })
    v2.version(2).stores({
      settings: 'key',
      outbox: 'id, createdAt',
      books: 'id, normTitle, inDrive, lastSeenAt',
      bookFiles: 'bookId, cachedAt, lastOpenedAt',
      covers: 'bookId',
      progress: 'id, bookId, normTitle, updatedAt',
    })
    await v2.open()
    const progressRow = {
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
      deleted: 0 as const,
    }
    await v2.table('progress').put(progressRow)
    v2.close()

    const db = await newDb(name)
    expect(db.verno).toBe(4)
    expect(await db.progress.get('b1')).toEqual(progressRow)
    expect(await db.storyRequests.count()).toBe(0)
  })

  it('story-request.backup.roundtrip: two storyRequests with the same key throw ConstraintError', async () => {
    const db = await newDb()
    await db.storyRequests.add(request('r1', 'pham nhan tu tien|vong ngu'))

    await expect(db.storyRequests.add(request('r2', 'pham nhan tu tien|vong ngu'))).rejects.toMatchObject({
      name: 'ConstraintError',
    })
    expect(await db.storyRequests.count()).toBe(1)
  })

  it('story-request.backup.roundtrip: export includes storyRequests', async () => {
    const db = await newDb()
    await db.storyRequests.put(request('r1', 'k1'))

    const doc = JSON.parse(await readBlobText(await exportData(db))) as {
      tables: Record<string, unknown[]>
    }
    expect(doc.tables.storyRequests).toEqual([request('r1', 'k1')])
  })

  it('story-request.backup.roundtrip: import skips a row whose unique key matches an existing row with a different id', async () => {
    const db = await newDb()
    await db.storyRequests.put(request('r-local', 'shared-key', { title: 'Local', updatedAt: 5 }))

    const json = JSON.stringify({
      app: db.name,
      schemaVersion: 3,
      tables: {
        storyRequests: [
          request('r-remote', 'shared-key', { title: 'Remote', updatedAt: 10 }),
          request('r-other', 'other-key', { title: 'Other', updatedAt: 10 }),
        ],
      },
    })

    const result = await importData(db, json)

    expect(result.imported).toBe(1)
    expect(await db.storyRequests.get('r-remote')).toBeUndefined()
    expect(await db.storyRequests.get('r-other')).toMatchObject({ title: 'Other', key: 'other-key' })
    expect(await db.storyRequests.get('r-local')).toMatchObject({ title: 'Local', key: 'shared-key' })
  })
})
