# Tasks — move-books-to-r2

Every task: TDD (failing run first), test names start with the scenario ID, full unit suite
green at the end (`npx vitest run`), `npx tsc -b` clean. Design references are to `design.md`.

## 1. Worker

- [x] 1.1 Worker public routes
  - Scenarios: worker.public.catalog, worker.public.immutable, worker.public.not-found, worker.public.not-modified, worker.range.partial, worker.download.disposition, worker.cache.hit
  - Files: worker/src/handler.ts, tests/worker/fake-bucket.ts, tests/worker/public.test.ts, vite.config.ts (test.include adds `tests/worker/**/*.test.ts`)
  - Test: npx vitest run tests/worker/public.test.ts
  - Done when: `handle()` per design §1 for GET/HEAD/OPTIONS on public paths; test files start with `// @vitest-environment node`; 405 for POST on `/catalog.json`; 416 for an unsatisfiable range.
- [x] 1.2 Worker admin API
  - Scenarios: worker.admin.unauthorized, worker.admin.origin, worker.admin.put, worker.admin.bad-key, worker.admin.if-match, worker.admin.list, worker.admin.preflight
  - Files: worker/src/handler.ts, tests/worker/admin.test.ts
  - Test: npx vitest run tests/worker
  - Done when: design §1 admin rules hold, DELETE of an allowed key returns 204.
- [x] 1.3 Worker entry and tooling
  - Scenarios: — (wiring)
  - Files: worker/src/index.ts, worker/wrangler.toml, worker/tsconfig.json, package.json (devDeps `wrangler`, `@cloudflare/workers-types`; scripts `worker:dev` = `wrangler dev -c worker/wrangler.toml`, `worker:deploy` = `wrangler deploy -c worker/wrangler.toml`, `worker:typecheck` = `tsc -p worker/tsconfig.json --noEmit`)
  - Test: npm run worker:typecheck && npx vitest run tests/worker
  - Done when: typecheck passes; root `npx tsc -b` does not include `worker/`.

## 2. Domain and config

- [x] 2.1 slug, genre, file name helpers
  - Scenarios: library.filter.genre (key matching), library.download.cached (file name)
  - Files: src/domain/slug.ts, src/domain/genre.ts, src/domain/file-name.ts, tests/unit/slug.test.ts, tests/unit/genre.test.ts, tests/unit/file-name.test.ts
  - Test: npx vitest run tests/unit/slug.test.ts tests/unit/genre.test.ts tests/unit/file-name.test.ts
  - Done when: `slugify("Đấu Phá Thương Khung") === "dau-pha-thuong-khung"`; `isSlug("1AbC_x") === false`; `canonicalGenre("xianxia") === "Tiên hiệp"`, `canonicalGenre("đô thị") === "Đô Thị"`; `genresFromSubjects(["Tiên Hiệp","tien hiep","Fantasy"])` → `["Tiên hiệp","Huyền huyễn"]`; `epubFileName('A/B: "C"')` → `A_B_ _C_.epub`.
- [x] 2.2 R2 config
  - Scenarios: app-shell.config.missing (config part)
  - Files: src/config.ts, src/vite-env.d.ts, .env.example, tests/unit/config.test.ts
  - Test: npx vitest run tests/unit/config.test.ts
  - Done when: `getR2Config({ VITE_R2_BASE_URL: 'https://x.dev/' })` → `{ baseUrl: 'https://x.dev' }`; `'ftp://x'`, `''`, missing → null. `getDriveConfig` removed only in task 5.2 (callers still use it until then).

## 3. Data

- [x] 3.1 Dexie v4
  - Scenarios: catalog.sync.fields (row shape)
  - Files: src/db/db.ts, tests/unit/db.v4.test.ts, knowledge/data is updated by the architect
  - Test: npx vitest run tests/unit/db.v4.test.ts
  - Done when: v3 data opens as v4; books rows gain `author: ''`, `normAuthor: ''`, `genres: []`, `description: ''`; `covers` table no longer exists; `Cover` type removed. Existing code still referencing `db.covers` (catalog-repo, book-cache, cover-service) is updated to not touch covers; cover-service is left for task 5.2 to delete but must compile (stub its `db.covers` usage out by deleting `src/covers/` and its tests now if simpler — then also remove `coverService` from services and LibraryPage props, passing no `getCover`).

## 4. Source and catalog

- [x] 4.1 R2 source
  - Scenarios: catalog.sync.fields, catalog.sync.invalid, catalog.sync.missing, catalog.sync.server-error (error kind), cache.fetch.content-length, cache.fetch.abort, cache.fetch.not-found
  - Files: src/source/r2-source.ts, tests/unit/r2-source.test.ts
  - Test: npx vitest run tests/unit/r2-source.test.ts
  - Done when: design §5 holds with a fake `fetchFn`.
- [x] 4.2 Catalog repo on R2 entries
  - Scenarios: catalog.sync.fields, catalog.reconcile.keep-cached, catalog.reconcile.keep-progress, catalog.reconcile.reappear, catalog.reattach.same-title, catalog.reattach.same-file
  - Files: src/catalog/catalog-repo.ts, tests/unit/catalog-repo.test.ts
  - Test: npx vitest run tests/unit/catalog-repo.test.ts
  - Done when: design §6; `upsertPage`/`DriveFileLike` removed.
- [x] 4.3 Catalog sync on the source
  - Scenarios: catalog.sync.single-request, catalog.reconcile.failure, catalog.trigger.single-flight, catalog.trigger.visible-throttle, catalog.sync.offline, catalog.sync.resync, catalog.sync.server-error
  - Files: src/catalog/catalog-sync.ts, tests/unit/catalog-sync.test.ts, src/services.ts
  - Test: npx vitest run tests/unit/catalog-sync.test.ts
  - Done when: design §6 sync; services build `source` from `getR2Config()`.

## 5. Cache and wiring

- [x] 5.1 Book cache on the source
  - Scenarios: cache.fetch.first-read, cache.fetch.content-length, cache.fetch.abort, cache.fetch.interrupted, cache.fetch.not-found, cache.fetch.quota, cache.fetch.offline
  - Files: src/cache/book-cache.ts, tests/unit/book-cache.test.ts
  - Test: npx vitest run tests/unit/book-cache.test.ts
  - Done when: design §7; no import from `src/drive`.
- [x] 5.2 Remove Drive and cover extraction
  - Scenarios: — (cleanup)
  - Files: delete src/drive/**, src/covers/** (if still present), tests/unit/drive-api.test.ts, tests/unit/cover-service.test.ts, tests/unit/extract-cover.test.ts; src/services.ts; src/config.ts (drop getDriveConfig); any remaining importers
  - Test: npx tsc -b && npx vitest run
  - Done when: `grep -rn "drive\|googleapis" src` finds nothing but comments; suite green.

## 6. UI

- [x] 6.1 ProgressBar
  - Scenarios: library.progress.shown, library.progress.indeterminate
  - Files: src/ui/ProgressBar.tsx, src/styles/app.css, tests/unit/progress-bar.test.tsx
  - Test: npx vitest run tests/unit/progress-bar.test.tsx
  - Done when: design §8 Components.
- [x] 6.2 CoverImage from URL
  - Scenarios: library.cover.remote, library.cover.fallback
  - Files: src/ui/library/CoverImage.tsx, tests/unit/cover-image.test.tsx
  - Test: npx vitest run tests/unit/cover-image.test.tsx
  - Done when: placeholder visible until `load`; `error` removes the img; no `src` → placeholder only.
- [x] 6.3 Library model filters
  - Scenarios: library.search.author, library.search.diacritics, library.search.tokens, library.filter.cached, library.filter.genre, library.filter.genre-other, library.filter.author, library.filter.combined
  - Files: src/ui/library/library-model.ts, src/domain/title.ts (only if `matchesQuery` needs a haystack param), tests/unit/library-model.test.ts
  - Test: npx vitest run tests/unit/library-model.test.ts
  - Done when: design §8 State and model.
- [x] 6.4 Library state: grid only + filter signals
  - Scenarios: library.grid.only, library.filter.persist
  - Files: src/ui/library/library-state.ts, tests/unit/library-state.test.ts
  - Test: npx vitest run tests/unit/library-state.test.ts
  - Done when: no `layout` export; `genre`, `author`, `clearFilters` exist.
- [x] 6.5 BookCard
  - Scenarios: library.progress.shown, library.progress.a11y, library.cover.local-only, library.read.offline-disabled, library.badge.states
  - Files: src/ui/library/BookCard.tsx, tests/unit/book-card.test.tsx
  - Test: npx vitest run tests/unit/book-card.test.tsx
  - Done when: design §8 BookCard; no `layout` prop.
- [x] 6.6 LibraryPage toolbar and fetch flow
  - Scenarios: library.grid.only, library.read.navigate, library.read.fetch-first, library.download.cached, library.download.remote, library.download.offline, library.progress.cancel, library.progress.error, library.filter.clear, library.filter.a11y, library.filter.offline, app-shell.config.missing
  - Files: src/ui/library/LibraryPage.tsx, tests/unit/library.test.tsx, tests/unit/incremental.test.tsx (props only)
  - Test: npx vitest run tests/unit/library.test.tsx tests/unit/incremental.test.tsx
  - Done when: design §8 LibraryPage.
- [x] 6.7 Reader loading progress
  - Scenarios: reader.open.progress, cache.fetch.first-read
  - Files: src/ui/reader/ReaderPage.tsx, tests/unit/reader-page.test.tsx
  - Test: npx vitest run tests/unit/reader-page.test.tsx
- [x] 6.8 Settings "Máy chủ truyện"
  - Scenarios: app-shell.config.settings
  - Files: src/ui/settings/SettingsPage.tsx, tests/unit/settings.test.tsx, src/app.tsx (props only)
  - Test: npx vitest run tests/unit/settings.test.tsx tests/unit/app.test.tsx
- [x] 6.9 Service-worker cover cache
  - Scenarios: library.cover.offline (checked in 7.1)
  - Files: vite.config.ts
  - Test: npm run build && grep -q '"covers"' dist/sw.js
  - Done when: design §9 entry present in the built SW.

## 7. End to end

- [x] 7.1 R2 mock and e2e update
  - Scenarios: library.layout.narrow, library.layout.wide, library.cover.offline, library.progress.shown, library.filter.genre, catalog.sync.resync, app-shell.offline.reload
  - Files: tests/e2e/r2-mock.ts (replaces drive-mock.ts: routes `https://r2.test/catalog.json` and `https://r2.test/books/**`, serves fixtures, counts requests, optional delay), every tests/e2e/*.spec.ts that imports drive-mock, playwright.config.ts (env `VITE_R2_BASE_URL: 'https://r2.test'`, drop `VITE_GD_*`)
  - Test: npm run test:e2e
  - Done when: all e2e pass on mobile and desktop projects.

## 8. Verify (architect)

- [x] 8.1 Every scenario ID above appears in a test name (`grep -rn "<id>" tests`).
- [x] 8.2 `npm test`, `npm run build`, `npm run test:e2e`, `npm run check:okf`, `npx openspec validate move-books-to-r2 --strict`.
- [x] 8.3 Preview build: library with covers, genre/author filters, progress bar, offline reload.
