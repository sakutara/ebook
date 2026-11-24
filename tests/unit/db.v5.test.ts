import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../../src/db/db'
import { importData } from '../../src/data/backup'

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

/** Raw Dexie v4 schema, copied from the shipped v4 block, to seed a pre-v5 database. */
function openV4(name: string) {
  const v4 = new Dexie(name)
  v4.version(1).stores({ settings: 'key', outbox: 'id, createdAt' })
  v4.version(2).stores({
    settings: 'key',
    outbox: 'id, createdAt',
    books: 'id, normTitle, inDrive, lastSeenAt',
    bookFiles: 'bookId, cachedAt, lastOpenedAt',
    covers: 'bookId',
    progress: 'id, bookId, normTitle, updatedAt',
  })
  v4.version(3).stores({
    settings: 'key',
    outbox: 'id, createdAt',
    books: 'id, normTitle, inDrive, lastSeenAt',
    bookFiles: 'bookId, cachedAt, lastOpenedAt',
    covers: 'bookId',
    progress: 'id, bookId, normTitle, updatedAt',
    storyRequests: 'id, &key, createdAt',
  })
  v4.version(4).stores({
    settings: 'key',
    outbox: 'id, createdAt',
    books: 'id, normTitle, inDrive, lastSeenAt',
    bookFiles: 'bookId, cachedAt, lastOpenedAt',
    covers: null,
    progress: 'id, bookId, normTitle, updatedAt',
    storyRequests: 'id, &key, createdAt',
  })
  return v4
}

function v4Request(id: string, key: string, title: string, author: string, createdAt: number) {
  return { id, key, title, author, originalTitle: '', language: '', createdAt, sentAt: null, updatedAt: createdAt, deleted: 0 as const }
}

function v4Op(id: string, entityId: string, key: string, title: string, author: string) {
  return {
    id,
    type: 'storyRequest.submit',
    entity: 'storyRequests',
    entityId,
    payload: { title, author, originalTitle: '', language: '', key },
    createdAt: 1,
    attempts: 0,
  }
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('db.v5', () => {
  it('story-request.dedup.migrate: v4 rows re-keyed by title, newer duplicate and its op removed on upgrade', async () => {
    const name = freshName()
    const v4 = openV4(name)
    await v4.open()
    await v4.table('storyRequests').bulkAdd([
      v4Request('r1', 'tam quoc|la quan trung', 'Tam Quốc', 'La Quán Trung', 1),
      v4Request('r2', 'tam quoc|', 'Tam Quốc', '', 2),
      v4Request('r3', 'dau pha|', 'Đấu Phá', '', 3),
    ])
    await v4.table('outbox').bulkAdd([
      v4Op('o2', 'r2', 'tam quoc|', 'Tam Quốc', ''),
      v4Op('o3', 'r3', 'dau pha|', 'Đấu Phá', ''),
    ])
    v4.close()

    const db = await newDb(name)

    expect(db.verno).toBe(5)
    const rows = await db.storyRequests.orderBy('createdAt').toArray()
    expect(rows.map((r) => [r.id, r.key])).toEqual([
      ['r1', 'tam quoc'],
      ['r3', 'dau pha'],
    ])
    expect(await db.storyRequests.get('r2')).toBeUndefined()
    const ops = await db.outbox.toArray()
    expect(ops.map((o) => o.id)).toEqual(['o3'])
    expect((ops[0].payload as { key: string }).key).toBe('dau pha')
  })

  it('story-request.dedup.import-old-backup: rows with old title|author keys are re-keyed and clashing titles skipped', async () => {
    const db = await newDb()
    await db.storyRequests.add({
      id: 'existing', key: 'tam quoc', title: 'Tam Quốc', author: 'La Quán Trung',
      createdAt: 1, sentAt: null, updatedAt: 1, deleted: 0,
    })
    const backup = {
      app: db.name,
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      tables: {
        storyRequests: [
          { id: 'new', key: 'tam quoc|x', title: 'Tam Quốc', author: 'X', createdAt: 5, sentAt: null, updatedAt: 5, deleted: 0 },
          { id: 'k', key: 'kiem lai|', title: 'Kiếm Lai', author: '', createdAt: 6, sentAt: null, updatedAt: 6, deleted: 0 },
        ],
      },
    }

    await importData(db, JSON.stringify(backup))

    expect(await db.storyRequests.get('new')).toBeUndefined()
    expect(await db.storyRequests.get('existing')).toMatchObject({ key: 'tam quoc' })
    expect(await db.storyRequests.get('k')).toMatchObject({ key: 'kiem lai', title: 'Kiếm Lai' })
  })
})
