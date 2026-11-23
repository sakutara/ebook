import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppDB } from '../../src/db/db'
import { enqueue } from '../../src/sync/outbox'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('outbox ordering', () => {
  it('sync.resync.online-event: ops enqueued in the same millisecond keep call order', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const db = new AppDB('t-' + crypto.randomUUID())
    await db.open()
    for (let i = 0; i < 20; i++) {
      await enqueue(db, { type: 'note.upsert', entity: 'note', entityId: `e${i}`, payload: { i } })
    }
    const ops = await db.outbox.orderBy('createdAt').toArray()
    expect(ops.map((o) => o.entityId)).toEqual(Array.from({ length: 20 }, (_, i) => `e${i}`))
    vi.restoreAllMocks()
    db.close()
  })
})
