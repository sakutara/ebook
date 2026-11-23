import { AdminError, type AdminClient } from './admin-client'
import type { Catalog, Metadata } from './types'

const MAX_ATTEMPTS = 5

function sortById(books: Metadata[]): Metadata[] {
  return [...books].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Replaces the book with the same id, or adds it; books stay sorted by id. Pure. */
export function mergeEntry(catalog: Catalog, entry: Metadata, now: Date): Catalog {
  const others = catalog.books.filter((b) => b.id !== entry.id)
  return { schema: 1, generatedAt: now.toISOString(), books: sortById([...others, entry]) }
}

/** Drops the book with the given id; books stay sorted by id. Pure. */
export function removeEntry(catalog: Catalog, id: string, now: Date): Catalog {
  return {
    schema: 1,
    generatedAt: now.toISOString(),
    books: sortById(catalog.books.filter((b) => b.id !== id)),
  }
}

/**
 * Read → change → PUT catalog.json with If-Match. Retries the whole read-change-write on a
 * 412 (conflict), up to 5 attempts in total. The result gets generatedAt = now().
 */
export async function updateCatalog(
  client: AdminClient,
  change: (c: Catalog) => Catalog,
  now: () => Date = () => new Date(),
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { catalog, etag } = await client.getCatalog()
    const next: Catalog = { ...change(catalog), generatedAt: now().toISOString() }
    try {
      await client.put('catalog.json', JSON.stringify(next), {
        contentType: 'application/json; charset=utf-8',
        ifMatch: etag,
      })
      return
    } catch (e) {
      if (e instanceof AdminError && e.kind === 'conflict') continue
      throw e
    }
  }
  throw new Error('Không cập nhật được catalog')
}
