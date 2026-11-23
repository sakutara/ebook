# Tasks — add-ebook-library-reader

Rules for every task: strict TDD (failing run first, then passing full suite). Test names
start with the scenario ID. Do not edit `openspec/**` or `knowledge/**`. Design reference:
`design.md` section numbers in brackets. Default full-suite command: `npm test`.

## 0. Setup

- [x] 0.1 Dependencies, config and build settings [1, 5]
  - Scenarios: — (enabler)
  - Files: package.json, vite.config.ts, src/config.ts, src/vite-env.d.ts, .env.example, src/reader/pdf-stub.ts (only if needed), tests/unit/config.test.ts
  - Do: `npm i foliate-js@1.0.1`; add `getDriveConfig`; vite `build.target 'es2022'`, `optimizeDeps.exclude ['foliate-js']`, workbox `maximumFileSizeToCacheInBytes 3 MiB`, `define.__APP_VERSION__`; set `<html lang="vi">` in index.html.
  - Test: npx vitest run tests/unit/config.test.ts && npm run build
  - Done when: `getDriveConfig({VITE_GD_API_KEY:'k',VITE_GD_FOLDER_ID:'f'})` → `{apiKey:'k',folderId:'f'}`, empty either → `null`; `npm run build` succeeds and `dist/` contains a foliate epub chunk.

- [x] 0.2 EPUB fixtures generator [6]
  - Scenarios: — (enabler)
  - Files: scripts/make-fixtures.mjs, package.json (`pretest`, `pretest:e2e` scripts; no new dependency), .gitignore (`tests/fixtures/`), tests/unit/fixtures.test.ts
  - Test: npm test -- tests/unit/fixtures.test.ts
  - Done when: the 5 fixture files exist; the test reads each with foliate-js/vendor/zip.js and checks `mimetype` is the first entry, chapter count (10, or 9 for v4), v2 chapter 5 has 41 paragraphs, `book-nocover.epub` has no `cover-image` item.

## 1. Data

- [x] 1.1 Dexie schema v2 + backup skip list [2]
  - Scenarios: progress.backup.roundtrip (skip part)
  - Files: src/db/db.ts, src/data/backup.ts, tests/unit/db.v2.test.ts
  - Test: npx vitest run tests/unit/db.v2.test.ts
  - Done when: tables and indexes match design §2 exactly; a v1 DB with a `settings` row opens at v2 with the row intact; `exportData` output has no `books`/`bookFiles`/`covers` keys.

## 2. Domain logic (pure)

- [x] 2.1 Title normaliser and query matcher [3.1]
  - Scenarios: catalog.sync.fields (title/normTitle), library.search.diacritics, library.search.tokens
  - Files: src/domain/title.ts, tests/unit/title.test.ts
  - Test: npx vitest run tests/unit/title.test.ts
  - Done when: `titleFromName('Đấu_Phá  Thương Khung.EPUB')` = `'Đấu Phá Thương Khung'`; `normalize` of it = `'dau pha thuong khung'`; `matchesQuery('dau pha thuong khung','khung thuong')` true; `'dau pha'` vs `'de ba'` false; empty query true.

- [x] 2.2 Anchor builder and restore planner [3.6]
  - Scenarios: progress.resume.same-version, progress.resume.after-refresh, progress.resume.snippet-gone, progress.resume.section-gone (planning)
  - Files: src/progress/anchor.ts, tests/unit/anchor.test.ts
  - Test: npx vitest run tests/unit/anchor.test.ts
  - Done when: `planRestore` returns `[]` for undefined/deleted, `[cfi, fraction]` for equal md5, `[cfi-if-text, snippet, section, fraction]` for a different md5 (snippet step omitted when key empty); snippet ≤ 120 chars with collapsed whitespace; `snippetKey` ≤ 40 chars normalised.

- [x] 2.3 Restore executor with a fake adapter [3.6]
  - Scenarios: progress.resume.after-refresh, progress.resume.snippet-gone, progress.resume.section-gone
  - Files: src/reader/restore.ts, tests/unit/restore.test.ts
  - Test: npx vitest run tests/unit/restore.test.ts
  - Done when: with a fake `ReaderAdapter` recording calls: text mismatch at CFI → falls to `findInSection` on the href-matched index; snippet missing → `goTo({index, anchor: sectionFraction})`; href and index both missing → `goToFraction`; returns the step kind used; empty plan → `next()` and `'start'`.

- [x] 2.4 Reader prefs [3.7]
  - Scenarios: reader.prefs.persist (storage)
  - Files: src/reader/prefs.ts, tests/unit/prefs.test.ts
  - Test: npx vitest run tests/unit/prefs.test.ts
  - Done when: defaults when unset; save→load round-trips; fontScale clamped to [0.8,1.6] and rounded to 0.1; `prefsCss` contains the theme colours from design §3.7.

- [x] 2.5 Save scheduler [3.6]
  - Scenarios: progress.save.relocate, progress.save.hidden
  - Files: src/progress/save-scheduler.ts, tests/unit/save-scheduler.test.ts
  - Test: npx vitest run tests/unit/save-scheduler.test.ts
  - Done when: with fake timers, 5 pushes within 1 s → 1 save with the last anchor after 1 s; `flush()` 200 ms after a push saves immediately and cancels the pending timer; `flush()` with nothing pending does nothing.

## 3. Drive access

- [x] 3.1 Drive API client [3.2]
  - Scenarios: catalog.sync.config-error (mapping), catalog.sync.paged (request shape)
  - Files: src/drive/drive-api.ts, tests/unit/drive-api.test.ts
  - Test: npx vitest run tests/unit/drive-api.test.ts
  - Done when: `listPage` URL has exactly the params in §3.2 (assert with `URL.searchParams`); `pageToken` passed through; error kinds mapped for: fetch TypeError, 403 `API_KEY_HTTP_REFERRER_BLOCKED` (in `error.details[].reason`), 403 `accessNotConfigured` (in `error.errors[].reason`), 404, 429, 500; `fetchBook` reports increasing integer percentages from a streamed body and returns a Blob of the right size; `fetchRange` sends `Range: bytes=a-b` and, if the response is 200, returns the requested slice of the full body; `downloadUrl('x')` = `https://drive.google.com/uc?export=download&id=x`.

- [x] 3.2 Range reader + cover extraction [3.5]
  - Scenarios: library.cover.range, library.cover.none
  - Files: src/drive/range-reader.ts, src/covers/extract-cover.ts, tests/unit/extract-cover.test.ts
  - Test: npx vitest run tests/unit/extract-cover.test.ts
  - Done when: `extractCover(blob of book-v1)` returns an `image/jpeg` Blob equal in bytes to the fixture cover; `extractCover(new DriveRangeReader(fakeApi, id, size))` returns the same bytes while the fake api's total requested bytes are < 50 % of the file size; `book-nocover` → `null`. (If foliate's EPUB needs DOMParser, run this file with `// @vitest-environment jsdom`.)

## 4. Repositories

- [x] 4.1 Catalog repository [3.3]
  - Scenarios: catalog.sync.fields, catalog.reconcile.keep-cached, catalog.reconcile.keep-progress, catalog.reconcile.reappear, catalog.reattach.same-title
  - Files: src/catalog/catalog-repo.ts, tests/unit/catalog-repo.test.ts
  - Test: npx vitest run tests/unit/catalog-repo.test.ts
  - Done when: each scenario passes against fake-indexeddb with a fresh DB per test; non-`.epub` files ignored; `upsertPage` returns only genuinely new ids.

- [x] 4.2 Progress repository [3.6]
  - Scenarios: progress.save.offline, progress.save.resync, progress.clear.all, progress.backup.roundtrip
  - Files: src/progress/progress-repo.ts, tests/unit/progress-repo.test.ts
  - Test: npx vitest run tests/unit/progress-repo.test.ts
  - Done when: each save writes the row and one `progress.upsert` outbox op atomically (abort test: throw inside the tx → neither stored); 3 offline saves then `online` event with the existing sync engine → outbox empty; `clearAllProgress` → all `deleted=1` + one `progress.delete` op each, `getProgress` → undefined; export→import into a fresh DB restores progress.

- [x] 4.3 Book cache [3.4]
  - Scenarios: cache.fetch.first-read, cache.fetch.interrupted, cache.fetch.quota, cache.fetch.offline, cache.persist.removed-from-drive, cache.stale.detect, cache.stale.background-refresh, cache.stale.open-online, cache.stale.offline, cache.stale.refresh-fails, cache.clear.one, cache.clear.all, cache.clear.local-only
  - Files: src/cache/book-cache.ts, tests/unit/book-cache.test.ts
  - Test: npx vitest run tests/unit/book-cache.test.ts
  - Done when: each scenario passes with a fake api (`fetchBook` resolving fixture blobs or rejecting); quota simulated by stubbing `db.bookFiles.put` to throw `DOMException('','QuotaExceededError')`; `navigator.storage.persist` called exactly once across two stores; deleting caches never touches `progress`; `refreshStale` downloads serially (assert max 1 in flight).

- [x] 4.4 Cover service [3.5]
  - Scenarios: library.cover.cached, library.cover.offline, library.cover.none, library.cover.lazy (concurrency part)
  - Files: src/covers/cover-service.ts, src/covers/downscale.ts, tests/unit/cover-service.test.ts
  - Test: npx vitest run tests/unit/cover-service.test.ts
  - Done when: matching-md5 row returns without calling extract; md5 mismatch re-extracts; offline + uncached → `undefined`, nothing stored; extract → `null` stores `blob: null`; 8 concurrent `get` calls never have more than 3 extractions in flight; duplicate ids share one extraction. `downscale` is injected/mocked (jsdom has no canvas).

## 5. Sync

- [x] 5.1 Catalog sync engine [3.3]
  - Scenarios: catalog.sync.paged, catalog.reconcile.partial-failure, cache.stale.resync, catalog.trigger.single-flight, catalog.trigger.visible-throttle, catalog.sync.offline, catalog.sync.resync, catalog.sync.config-error
  - Files: src/catalog/catalog-sync.ts, tests/unit/catalog-sync.test.ts
  - Test: npx vitest run tests/unit/catalog-sync.test.ts
  - Done when: fake api with 3 pages (200/200/50 + 3 non-epub) → 450 rows, and rows of page 1 are queryable while page 2's promise is still pending; failure on page 2 → no `inDrive` change, status error, lastSyncAt unchanged; offline start → zero api calls, state idle; `online` event → sync; visibility throttle with `now` injected; `onSynced` called once after success only (cache.stale.resync: an `online` event after an offline start runs a sync whose `onSynced` triggers the stale refresh).

- [x] 5.2 Outbox ordering fix (found in review: equal `createdAt` in one millisecond flushed out of order)
  - Scenarios: sync.resync.online-event (existing spec)
  - Files: src/sync/outbox.ts, tests/unit/outbox-order.test.ts
  - Test: npx vitest run tests/unit/outbox-order.test.ts tests/unit/sync-engine.test.ts
  - Done when: `enqueue` assigns strictly increasing `createdAt` (`Math.max(Date.now(), last + 1)`), so ops enqueued in the same millisecond flush in call order; the sync-engine suite passes 20 runs in a row.

## 6. UI

- [x] 6.0 Icon, IconButton, IconTextButton [4.0]
  - Scenarios: app-shell.icons.icon-only, app-shell.icons.labelled-exceptions (component level)
  - Files: src/ui/icons/Icon.tsx, tests/unit/icons.test.tsx (read-only: src/ui/icons/svg/*.svg — do not edit or add SVGs)
  - Test: npx vitest run tests/unit/icons.test.tsx
  - Done when: every `IconName` has a file and vice versa; every file has `viewBox="0 0 24 24"` and `stroke="currentColor"`; `IconButton` renders a `button` with an `svg`, no text node, `aria-label` === `title` === label, classes `min-h-11 min-w-11`, `aria-pressed` when given; `IconTextButton` renders icon + visible text; disabled buttons have the `disabled` attribute.


- [x] 6.1 Router, services, live-query hook, toast, app shell [4]
  - Scenarios: app-shell.routes.reader-fullscreen (nav hidden part), app-shell.icons.labelled-exceptions (nav)
  - Files: src/router.ts, src/services.ts, src/ui/useLiveQuery.ts, src/ui/toast.ts, src/ui/Toast.tsx, src/app.tsx, src/main.tsx, tests/unit/app.test.tsx
  - Test: npx vitest run tests/unit/app.test.tsx
  - Done when: `App` takes `pages: { library, reader, settings }` components as props (main.tsx passes the real pages; until 6.3/6.4/6.6 exist main passes simple placeholders); nav uses IconTextButton-style links (`library` "Thư viện", `settings` "Cài đặt"); `#/read/a` renders the reader page with no `nav` landmarks; update toast uses IconButton `update` "Cập nhật phiên bản mới"; `services.ts` builds `{ db, config, api, catalogSync, cacheDeps }` once; main.tsx starts the outbox sync engine and catalog sync with `onSynced` → `refreshStale(cacheDeps)`; foliate probe line and src/reader/foliate-probe.ts removed.

- [x] 6.2 Incremental list + cover image [3.5, 4]
  - Scenarios: library.grid.incremental, library.cover.lazy (observer part)
  - Files: src/ui/library/useIncrementalList.ts, src/ui/library/CoverImage.tsx, tests/setup.ts (IntersectionObserver mock with a `trigger(el, isIntersecting)` helper), tests/unit/incremental.test.tsx
  - Test: npx vitest run tests/unit/incremental.test.tsx
  - Done when: 130 items → 40, 80, 120, 130 after successive sentinel triggers; resets to 40 when items identity-changes due to a new query; CoverImage calls `get` only after its element intersects, shows placeholder (aria-label = title) for `null`/`undefined`, revokes its object URL on unmount.

- [x] 6.3 Library page and book card [4]
  - Scenarios: app-shell.config.missing, app-shell.icons.icon-only (library), library.grid.sorted, library.search.diacritics, library.search.empty, library.filter.cached, library.badge.states, library.download.cached, library.download.remote, library.download.offline, library.read.navigate, library.read.offline-disabled
  - Files: src/ui/library/LibraryPage.tsx, src/ui/library/BookCard.tsx, src/ui/library/SearchBar.tsx, tests/unit/library.test.tsx
  - Test: npx vitest run tests/unit/library.test.tsx
  - Done when: each scenario passes with seeded fake-indexeddb data, `syncStatus.online` toggled, fake timers for the 150 ms debounce, `location.assign` and `URL.createObjectURL` spied; visibility rule from design §3.4 applied (local-only + no file → hidden); buttons found by role + accessible name ("Đọc", "Tải", "Cần mạng để đọc", "Làm mới", "Xoá tìm kiếm"), all via IconButton from 6.0.

- [x] 6.4 Settings page [4]
  - Scenarios: cache.clear.one, cache.clear.all, cache.clear.cancel, progress.clear.all (UI), cache.layout.narrow, cache.layout.wide (structure)
  - Files: src/ui/settings/SettingsPage.tsx, tests/unit/settings.test.tsx
  - Test: npx vitest run tests/unit/settings.test.tsx
  - Done when: rows sorted by lastOpenedAt desc with size in MB (1 decimal); confirm dialog cancel → no deletion; confirm → repositories called; the cached list renders as a `<ul>` below `lg` and a `<table>` from `lg` (both in DOM, toggled by `lg:hidden` / `hidden lg:table` classes — assert classes); export/import IconButtons present; dialog buttons are IconTextButtons "Xoá" / "Huỷ".

- [x] 6.5 Foliate adapter [3.6]
  - Scenarios: — (exercised by e2e 7.2/7.3)
  - Files: src/reader/foliate-adapter.ts
  - Test: npm run build (type-check) — behaviour covered in 7.2
  - Done when: implements every `ReaderAdapter` method in design §3.6; no other file imports `foliate-js/view.js`; `findInSection` normalises text with `normalize` from title.ts and returns a CFI from `view.getCFI(index, range)`.

- [x] 6.6 Reader page [4]
  - Scenarios: reader.open.unknown, cache.fetch.offline (UI), cache.fetch.interrupted (UI), cache.fetch.quota (UI), cache.stale.offline (toast)
  - Files: src/ui/reader/ReaderPage.tsx, ReaderChrome.tsx, TocPanel.tsx, PrefsSheet.tsx, LoadingOverlay.tsx, tests/unit/reader-page.test.tsx
  - Test: npx vitest run tests/unit/reader-page.test.tsx
  - Done when: with `getBookFile` and the adapter factory injected as props/module mocks: unknown id → "Không tìm thấy truyện" + "Về thư viện"; each CacheError kind shows its message from the cache spec; `usedOld` → toast text exact; relocate events feed the save scheduler; `pagehide` flushes; after a non-`cfi` restore the first relocate saves immediately; chrome and typography sheet buttons are IconButtons with the names in design §4 Reader step 7.

- [x] 6.7 Wire the reader + library review fixes
  - Scenarios: library.search.empty (empty-catalog copy), app-shell.icons.labelled-exceptions (filter radios)
  - Files: src/main.tsx, src/ui/icons/Icon.tsx, src/ui/library/LibraryPage.tsx, tests/unit/icons.test.tsx, tests/unit/library.test.tsx
  - Test: npx vitest run tests/unit/icons.test.tsx tests/unit/library.test.tsx
  - Done when: `IconTextButton` accepts optional `role` and `checked` (role="radio" → aria-checked, no aria-pressed) and the filter uses it without wrapper spans; the grid renders only after books, files and progress queries have all loaded; empty catalog and not syncing → "Chưa có truyện nào"; main.tsx renders `ReaderPage` with `db`, `cacheDeps`, `onNotice: showToast`, `onBack: () => navigate('#/')`; placeholders file deleted if unused.

## 7. End-to-end

- [x] 7.1 Drive mock + library e2e
  - Scenarios: library.layout.narrow, library.layout.wide, app-shell.layout.narrow, app-shell.layout.wide, app-shell.routes.reader-fullscreen, library.search.offline, library.cover.range (smoke: cover img visible)
  - Files: tests/e2e/drive-mock.ts, tests/e2e/library.spec.ts, playwright.config.ts (webServer env + build with VITE_GD_* test values)
  - Test: npm run test:e2e -- tests/e2e/library.spec.ts
  - Done when: mobile project shows 2 grid columns (compare card `offsetLeft`s), desktop ≥ 6; no horizontal scroll on both; back from reader keeps query and scroll; offline search works via `context.setOffline(true)`.

- [x] 7.2 Reader e2e
  - Scenarios: reader.open.cached, reader.open.offline, reader.nav.tap, reader.nav.keys, reader.nav.slider, reader.chrome.toggle, reader.toc.go, reader.layout.narrow, reader.layout.wide, reader.prefs.apply, cache.fetch.first-read
  - Files: tests/e2e/reader.spec.ts
  - Test: npm run test:e2e -- tests/e2e/reader.spec.ts
  - Done when: assertions read the visible text inside the foliate iframe (`frameLocator`) for "C<c>P<n>" markers; % label changes as specified; the second open makes no `alt=media` request (count via the mock).

- [x] 7.3 Resume e2e
  - Scenarios: progress.resume.same-version, progress.resume.after-refresh, progress.resume.snippet-gone, progress.resume.section-gone, progress.resume.after-cache-clear, progress.resume.reuploaded, cache.stale.open-online, cache.stale.offline, cache.persist.removed-from-drive
  - Files: tests/e2e/resume.spec.ts
  - Test: npm run test:e2e -- tests/e2e/resume.spec.ts
  - Done when: read to chapter 5 paragraph ~20 on v1, reload app, see the same "C5P20" marker; switch the mock to v2 (new md5, later modifiedTime) → refresh → same marker visible; v3 → chapter 5 shown near the saved section fraction; v4 → whole-book fraction ± 5 %; clear cache in Settings → reopen → same marker; mock removes the file and adds a new id with the same name → same marker; stale + offline → old copy and the toast.

- [x] 7.3b Disambiguate snippet restore (found by 7.3 on mobile) + focus after TOC pick
  - Scenarios: progress.resume.ambiguous-snippet, progress.resume.after-refresh, reader.nav.keys
  - Files: src/progress/anchor.ts, src/reader/adapter.ts, src/reader/restore.ts, src/reader/foliate-adapter.ts, src/reader/text-index.ts (new, pure: build normalised text + map, find occurrences, pick nearest), src/ui/reader/TocPanel.tsx, tests/unit/anchor.test.ts, tests/unit/restore.test.ts, tests/unit/text-index.test.ts, tests/e2e/resume.spec.ts, tests/e2e/reader-helpers.ts
  - Test: npx vitest run && npm run test:e2e -- tests/e2e/resume.spec.ts tests/e2e/reader.spec.ts
  - Done when: design §3.6 snippet step implemented; text-index unit tests cover multi-occurrence nearest pick, cross-paragraph keys, diacritics; mobile after-refresh passes; after a TOC pick the picked button is blurred and arrow keys page immediately (blurFocus workaround removed from helpers).

- [x] 7.4 Offline e2e (extend existing)
  - Scenarios: app-shell.offline.reload, cache.fetch.offline
  - Files: tests/e2e/offline.spec.ts
  - Test: npm run test:e2e -- tests/e2e/offline.spec.ts
  - Done when: after one online visit and caching book "a", offline reload of `#/read/a` renders text; offline `#/read/<uncached>` shows "Cần kết nối mạng để tải truyện này lần đầu".

- [x] 7.5 Icons e2e
  - Scenarios: app-shell.icons.icon-only, app-shell.icons.labelled-exceptions, app-shell.icons.offline, app-shell.icons.theme, app-shell.icons.layout.narrow, app-shell.icons.layout.wide
  - Files: tests/e2e/icons.spec.ts
  - Test: npm run test:e2e -- tests/e2e/icons.spec.ts
  - Done when: on library, reader (chrome shown) and settings, a page-level audit finds every `button` outside `nav`, `[role=radiogroup]` and `dialog` has an `svg`, empty `innerText`, and `aria-label` === `title`; boxes ≥ 44×44 and gaps ≥ 8 px on mobile; offline reload shows icons with no `.svg` requests; in theme Tối the icon `svg` computed `color` equals the chrome's text colour; keyboard Tab shows a focus outline on desktop.

## 8. Verify (Opus)

- [ ] 8.1 Coverage and gates
  - Do: for every scenario ID in `specs/**` run `grep -r "<id>" tests/` (each must hit); `npm test`, `npm run test:e2e`, `npm run build`, `npm run check:okf`, `npx openspec validate add-ebook-library-reader --strict`; manual `npm run preview` with a real `.env.local` against the owner's Drive folder.
