import type { AppDB, Progress } from '../db/db'
import { enqueue } from '../sync/outbox'

export type AnchorInput = Omit<Progress, 'updatedAt' | 'deleted'> // id === bookId

/** Live (non-deleted) position for a book, or undefined. */
export async function getProgress(db: AppDB, bookId: string): Promise<Progress | undefined> {
  const row = await db.progress.get(bookId)
  return row && row.deleted === 0 ? row : undefined
}

/** Store the reading position and queue a progress.upsert op in the same transaction. */
export async function saveProgress(db: AppDB, a: AnchorInput, now = Date.now()): Promise<Progress> {
  const row: Progress = { ...a, id: a.bookId, updatedAt: now, deleted: 0 }
  await db.transaction('rw', db.progress, db.outbox, async () => {
    await db.progress.put(row)
    await enqueue(db, { type: 'progress.upsert', entity: 'progress', entityId: a.bookId, payload: row })
  })
  return row
}

/** Copy a live position to another book id. Returns false when the source is missing or deleted. */
export async function copyProgress(
  db: AppDB,
  fromBookId: string,
  toBookId: string,
  now = Date.now(),
): Promise<boolean> {
  let copied = false
  await db.transaction('rw', db.progress, db.outbox, async () => {
    const source = await getProgress(db, fromBookId)
    if (!source) return
    const row: Progress = { ...source, id: toBookId, bookId: toBookId, updatedAt: now, deleted: 0 }
    await db.progress.put(row)
    await enqueue(db, { type: 'progress.upsert', entity: 'progress', entityId: toBookId, payload: row })
    copied = true
  })
  return copied
}

/** Soft-delete every live position in one transaction. Returns the number of rows cleared. */
export async function clearAllProgress(db: AppDB, now = Date.now()): Promise<number> {
  let count = 0
  await db.transaction('rw', db.progress, db.outbox, async () => {
    const live = (await db.progress.toArray()).filter((p) => p.deleted === 0)
    for (const p of live) {
      await db.progress.put({ ...p, updatedAt: now, deleted: 1 })
      await enqueue(db, { type: 'progress.delete', entity: 'progress', entityId: p.id, payload: { id: p.id } })
    }
    count = live.length
  })
  return count
}

/** All non-deleted positions. */
export async function listLiveProgress(db: AppDB): Promise<Progress[]> {
  return (await db.progress.toArray()).filter((p) => p.deleted === 0)
}
