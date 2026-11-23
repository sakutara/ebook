import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'preact'
import { render, screen, cleanup } from '@testing-library/preact'
import { AppDB, db } from '../../src/db/db'
import { enqueue, pendingCount } from '../../src/sync/outbox'
import { syncStatus } from '../../src/sync/sync-engine'
import { SyncBadge } from '../../src/app'
import { setOnline } from '../setup'

const opened: AppDB[] = []

function freshDb() {
  const d = new AppDB('t-' + crypto.randomUUID())
  opened.push(d)
  return d
}

afterEach(async () => {
  cleanup()
  await db.outbox.clear()
  for (const d of opened.splice(0)) {
    d.close()
  }
})

describe('sync spec (openspec/specs/sync/spec.md)', () => {
  it('sync.outbox.atomic: a write and its outbox op are both rolled back when the transaction aborts', async () => {
    const d = freshDb()
    await d.open()
    await expect(
      d.transaction('rw', d.progress, d.outbox, async () => {
        await d.progress.put({
          id: 'x',
          bookId: 'x',
          normTitle: 'x',
          cfi: '',
          snippet: '',
          sectionIndex: 0,
          sectionHref: '',
          sectionFraction: 0,
          fraction: 0,
          bookMd5: '',
          updatedAt: 1,
          deleted: 0,
        })
        await enqueue(d, { type: 'progress.upsert', entity: 'progress', entityId: 'x', payload: {} })
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')
    expect(await d.progress.count()).toBe(0)
    expect(await d.outbox.count()).toBe(0)
  })

  it('sync.status.offline: going offline shows offline with the pending count and no error', async () => {
    await enqueue(db, { type: 'progress.upsert', entity: 'progress', entityId: 'a', payload: {} })
    await enqueue(db, { type: 'progress.upsert', entity: 'progress', entityId: 'b', payload: {} })
    expect(await pendingCount(db)).toBe(2)

    try {
      setOnline(false)
      syncStatus.value = { online: false, pending: 2, syncing: false }
      render(h(SyncBadge, null))
      const status = screen.getByRole('status', { name: 'Sync status' })
      expect(status).toHaveTextContent('Ngoại tuyến')
      expect(status).toHaveTextContent('2')
      expect(status).not.toHaveTextContent(/error/i)
      expect(status.className).not.toMatch(/red-/)
    } finally {
      setOnline(true)
      syncStatus.value = { online: true, pending: 0, syncing: false }
    }
  })
})
