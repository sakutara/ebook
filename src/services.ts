import { db as defaultDb, type AppDB } from './db/db'
import { getR2Config, type R2Config } from './config'
import { createCatalogSync } from './catalog/catalog-sync'
import { refreshStale, type CacheDeps } from './cache/book-cache'
import { createR2Source, type BookSource } from './source/r2-source'

export interface Services {
  db: AppDB
  config: R2Config | null
  source: BookSource | null
  catalogSync: ReturnType<typeof createCatalogSync>
  cacheDeps: CacheDeps
}

export function createServices(db: AppDB = defaultDb): Services {
  const config = getR2Config()
  const source = config ? createR2Source(config) : null
  const cacheDeps: CacheDeps = { db, source }
  const catalogSync = createCatalogSync({
    db,
    source,
    onSynced: () => void refreshStale(cacheDeps),
  })
  return { db, config, source, catalogSync, cacheDeps }
}

let singleton: Services | undefined

/** Lazily-built app-wide services. */
export function getServices(): Services {
  singleton ??= createServices(defaultDb)
  return singleton
}
