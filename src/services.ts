import { db as defaultDb, type AppDB } from './db/db'
import { getDriveConfig, type DriveConfig } from './config'
import { createDriveApi, type DriveApi } from './drive/drive-api'
import { createCatalogSync } from './catalog/catalog-sync'
import { refreshStale, type CacheDeps } from './cache/book-cache'
import { createCoverService, type CoverService } from './covers/cover-service'

export interface Services {
  db: AppDB
  config: DriveConfig | null
  api: DriveApi | null
  catalogSync: ReturnType<typeof createCatalogSync>
  cacheDeps: CacheDeps
  coverService: CoverService
}

export function createServices(db: AppDB = defaultDb): Services {
  const config = getDriveConfig()
  const api = config ? createDriveApi(config) : null
  const cacheDeps: CacheDeps = { db, api }
  const catalogSync = createCatalogSync({
    db,
    api,
    onSynced: () => void refreshStale(cacheDeps),
  })
  const coverService = createCoverService({ db, api })
  return { db, config, api, catalogSync, cacheDeps, coverService }
}

let singleton: Services | undefined

/** Lazily-built app-wide services. */
export function getServices(): Services {
  singleton ??= createServices(defaultDb)
  return singleton
}
