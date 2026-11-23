import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB } from '../../src/db/db'
import {
  clearAllProgress,
  copyProgress,
  getProgress,
  listLiveProgress,
  saveProgress,
  type AnchorInput,
} from '../../src/progress/progress-repo'
import { exportData, importData } from '../../src/data/backup'
import { createSyncEngine } from '../../src/sync/sync-engine'
import { setOnline } from '../setup'

let db: AppDB

const anchor = (bookId: string, overrides: Partial<AnchorInput> = {}): AnchorInput => ({
  id: bookId,
  bookId,
  normTitle: bookId,
  cfi: `epubcfi(/6/2!/4/${bookId})`,
  snippet: `snippet ${bookId}`,
  sectionIndex: 1,
  sectionHref: 'ch1.xhtml',
  sectionFraction: 0.5,
  fraction: 0.25,
  bookMd5: `md5-${bookId}`,
  ...overrides,
})

beforeEach(async () => {
  db = new AppDB(`t-${crypto.randomUUID()}`)
  await db.open()
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('progress repo', () => {
  it('progress.save.offline: stores the row and queues one progress.upsert op', async () => {
    setOnline(false)
    await saveProgress(db, anchor('a'), 1000)

    const row = await db.progress.get('a')
    expect(row).toMatchObject({ id: 'a', bookId: 'a', cfi: 'epubcfi(/6/2!/4/a)', updatedAt: 1000, deleted: 0 })

    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'progress.upsert', entity: 'progress', entityId: 'a' })
  })

  it('progress.save.offline: data and outbox are atomic', async () => {
    vi.spyOn(db.outbox, 'add').mockRejectedValueOnce(new Error('boom'))

    await expect(saveProgress(db, anchor('a'))).rejects.toThrow('boom')

    expect(await db.progress.get('a')).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('progress.save.resync: three offline saves are flushed when back online', async () => {
    setOnline(false)
    for (const id of ['a', 'b', 'c']) await saveProgress(db, anchor(id))
    expect(await db.outbox.count()).toBe(3)

    const engine = createSyncEngine(db)
    engine.start()
    setOnline(true)
    await engine.flush()

    expect(await db.outbox.count()).toBe(0)
    engine.stop()
  })

  it('progress.clear.all: soft-deletes every position and queues progress.delete ops', async () => {
    await saveProgress(db, anchor('a'), 1000)
    await saveProgress(db, anchor('b'), 1000)
    await db.outbox.clear()

    const count = await clearAllProgress(db, 2000)

    expect(count).toBe(2)
    expect((await db.progress.get('a'))?.deleted).toBe(1)
    expect((await db.progress.get('b'))?.deleted).toBe(1)
    expect((await db.progress.get('a'))?.updatedAt).toBe(2000)
    expect(await getProgress(db, 'a')).toBeUndefined()
    expect(await getProgress(db, 'b')).toBeUndefined()

    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(2)
    expect(ops.every((o) => o.type === 'progress.delete')).toBe(true)
    expect(ops.map((o) => o.entityId).sort()).toEqual(['a', 'b'])
  })

  it('progress.backup.roundtrip: export then import into a fresh db restores positions', async () => {
    const name = db.name
    await saveProgress(db, anchor('a'))
    await saveProgress(db, anchor('b'))
    await db.bookFiles.put({
      bookId: 'a', blob: new Blob(['x']), size: 1, md5: 'md5-a',
      modifiedTime: 1, cachedAt: 1, lastOpenedAt: 1,
    })

    const json = await (await exportData(db)).text()
    const doc = JSON.parse(json) as { tables: Record<string, unknown> }
    expect(doc.tables).not.toHaveProperty('bookFiles')
    expect(doc.tables).not.toHaveProperty('covers')
    expect(doc.tables).not.toHaveProperty('books')
    expect(json).not.toContain('"bookFiles"')
    expect(json).not.toContain('"covers"')
    expect(json).not.toContain('"books"')

    // Fresh install: same DB name, empty data.
    db.close()
    await new AppDB(name).delete()
    db = new AppDB(name)
    await db.open()

    await importData(db, json)

    expect((await getProgress(db, 'a'))?.cfi).toBe('epubcfi(/6/2!/4/a)')
    expect((await getProgress(db, 'b'))?.cfi).toBe('epubcfi(/6/2!/4/b)')
  })

  it('progress: copyProgress copies a live row to the new id and returns false for a missing source', async () => {
    await saveProgress(db, anchor('a'), 1000)
    await db.outbox.clear()

    expect(await copyProgress(db, 'missing', 'z', 2000)).toBe(false)
    expect(await db.progress.get('z')).toBeUndefined()

    expect(await copyProgress(db, 'a', 'z', 2000)).toBe(true)
    const copied = await db.progress.get('z')
    expect(copied).toMatchObject({
      id: 'z', bookId: 'z', cfi: 'epubcfi(/6/2!/4/a)', updatedAt: 2000, deleted: 0,
    })

    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'progress.upsert', entityId: 'z' })
  })

  it('progress: listLiveProgress excludes soft-deleted rows', async () => {
    await saveProgress(db, anchor('a'))
    await saveProgress(db, anchor('b'))
    await clearAllProgress(db)
    await saveProgress(db, anchor('c'))

    const live = await listLiveProgress(db)
    expect(live.map((p) => p.id)).toEqual(['c'])
  })
})
