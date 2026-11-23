import type { AppDB } from '../db/db'

export interface OutboxOp {
  id: string
  type: string // e.g. 'bookmark.upsert', 'bookmark.delete'
  entity: string
  entityId: string
  payload: unknown
  createdAt: number
  attempts: number
  lastError?: string
}

/** Call inside the same db.transaction('rw', table, db.outbox, ...) as the data write. */
export async function enqueue(
  db: AppDB,
  op: Omit<OutboxOp, 'id' | 'createdAt' | 'attempts'>,
): Promise<OutboxOp> {
  const full: OutboxOp = { ...op, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 }
  await db.outbox.add(full)
  return full
}

export const pendingCount = (db: AppDB) => db.outbox.count()
