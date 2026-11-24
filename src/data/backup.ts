import type { AppDB } from '../db/db'
import { requestKey } from '../domain/request-text'

const SKIP = new Set(['outbox', 'books', 'bookFiles', 'covers'])

/** Export every table except the outbox as one JSON blob. */
export async function exportData(db: AppDB): Promise<Blob> {
  const tables: Record<string, unknown[]> = {}
  for (const t of db.tables) if (!SKIP.has(t.name)) tables[t.name] = await t.toArray()
  const doc = { app: db.name, schemaVersion: db.verno, exportedAt: new Date().toISOString(), tables }
  return new Blob([JSON.stringify(doc)], { type: 'application/json' })
}

/** Merge an export into the DB; newer `updatedAt` wins, records without it are upserted. */
export async function importData(db: AppDB, json: string): Promise<{ imported: number }> {
  const doc = JSON.parse(json)
  if (doc?.app !== db.name || typeof doc.schemaVersion !== 'number') throw new Error('Not a backup of this app')
  if (doc.schemaVersion > db.verno) throw new Error('Backup is from a newer app version')
  let imported = 0
  await db.transaction('rw', db.tables.filter((t) => !SKIP.has(t.name)), async () => {
    for (const [name, rows] of Object.entries<Record<string, unknown>[]>(doc.tables)) {
      const table = db.tables.find((t) => t.name === name)
      if (!table) continue
      const key = table.schema.primKey.keyPath as string
      const uniqueIndexes = table.schema.indexes.filter((i) => i.unique)
      for (const row of rows) {
        // Story requests from older backups carry title|author keys; re-derive the title-only key.
        if (name === 'storyRequests' && typeof row.title === 'string') row.key = requestKey(row.title)
        // Skip rows that would collide with a different record on a unique index (would abort the import).
        let clash = false
        for (const idx of uniqueIndexes) {
          const value = row[idx.keyPath as string] as string | number | undefined
          if (value === undefined || value === null) continue
          const other = (await table.where(idx.name).equals(value).first()) as Record<string, unknown> | undefined
          if (other && other[key] !== row[key]) { clash = true; break }
        }
        if (clash) continue
        const existing = (await table.get(row[key] as string)) as { updatedAt?: number } | undefined
        if (!existing || (row.updatedAt as number ?? 0) >= (existing.updatedAt ?? 0)) { await table.put(row); imported++ }
      }
    }
  })
  return { imported }
}

export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false
}
