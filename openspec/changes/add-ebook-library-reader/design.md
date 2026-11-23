# Design — add-ebook-library-reader

Vocabulary and data shapes: /knowledge/domain/*.md and /knowledge/data/*.md. Decisions
0002–0005 in /knowledge/decisions/. This file says *how*; specs say *what*.

## 1. Configuration

`src/config.ts`

```ts
export interface DriveConfig { apiKey: string; folderId: string }
/** null when either env var is empty → app-shell.config.missing */
export function getDriveConfig(env = import.meta.env): DriveConfig | null
```

`.env.example` (committed): `VITE_GD_API_KEY=` and `VITE_GD_FOLDER_ID=`. `.env.local` is
already ignored by `*.local` in `.gitignore`. `src/vite-env.d.ts` declares both on
`ImportMetaEnv`.

## 2. Data model — Dexie schema v2

`src/db/db.ts` adds `this.version(2).stores({...})` (v1 block untouched). No upgrade
function needed (new tables only).

```ts
export interface Book { id: string; name: string; title: string; normTitle: string; size: number;
  modifiedTime: number; md5: string; inDrive: 0 | 1; lastSeenAt: number; updatedAt: number }
export interface BookFile { bookId: string; blob: Blob; size: number; md5: string;
  modifiedTime: number; cachedAt: number; lastOpenedAt: number }
export interface Cover { bookId: string; blob: Blob | null; md5: string; fetchedAt: number }
export interface Progress extends SyncedRecord { bookId: string; normTitle: string; cfi: string;
  snippet: string; sectionIndex: number; sectionHref: string; sectionFraction: number;
  fraction: number; bookMd5: string }   // id === bookId

version(2).stores({
  settings: 'key', outbox: 'id, createdAt',
  books: 'id, normTitle, inDrive, lastSeenAt',
  bookFiles: 'bookId, cachedAt, lastOpenedAt',
  covers: 'bookId',
  progress: 'id, bookId, normTitle, updatedAt',
})
```

`src/data/backup.ts`: `SKIP = new Set(['outbox', 'books', 'bookFiles', 'covers'])`.

## 3. Modules

```
src/config.ts
src/domain/title.ts          titleFromName(name), normalize(text), matchesQuery(normTitle, query)
src/drive/drive-api.ts       createDriveApi(cfg, fetchFn = fetch)
src/drive/range-reader.ts    DriveRangeReader (zip.js duck-typed reader over HTTP Range)
src/catalog/catalog-repo.ts  upsertPage, reconcile, reattachProgress
src/catalog/catalog-sync.ts  createCatalogSync(...) + catalogStatus signal
src/cache/book-cache.ts      isStale, getBookFile, refreshStale, deleteCache, deleteAllCache, cacheStats
src/covers/extract-cover.ts  extractCover(zipReaderInput) → Blob | null   (via foliate EPUB)
src/covers/downscale.ts      downscale(blob, maxWidth = 320) → Blob
src/covers/cover-service.ts  createCoverService(...) → requestCover(book) with queue(3)
src/progress/progress-repo.ts getProgress, saveProgress, copyProgress, clearAllProgress
src/progress/anchor.ts       pure: buildAnchor, snippetKey, planRestore
src/reader/foliate-adapter.ts the only file importing foliate-js/view.js
src/reader/restore.ts        restorePosition(adapter, progress, md5)
src/reader/prefs.ts          ReaderPrefs load/save (settings 'reader.prefs')
src/router.ts                route signal from location.hash
src/ui/library/{LibraryPage,BookCard,CoverImage,SearchBar,useIncrementalList}.tsx
src/ui/reader/{ReaderPage,ReaderChrome,TocPanel,PrefsSheet,LoadingOverlay}.tsx
src/ui/settings/SettingsPage.tsx
src/ui/toast.ts              toast signal
src/ui/icons/svg/*.svg       AI-drawn icon artwork (architect-owned, do not edit)
src/ui/icons/Icon.tsx        Icon + IconButton (§4.0)
src/app.tsx                  shell: routes, nav labels Thư viện / Cài đặt, update toast
src/main.tsx                 start sync engine + catalog sync
```

Repositories (`catalog-repo`, `book-cache`, `progress-repo`, `cover-service`) are the only
code touching Dexie tables other than `settings`. UI reads via `liveQuery` from Dexie
(`dexie`'s `liveQuery` wrapped in a tiny `useLiveQuery` hook in `src/ui/useLiveQuery.ts`).

### 3.1 title.ts (pure)

```ts
titleFromName(name: string): string
  // strip /\.epub$/i, '_' → ' ', collapse /\s+/ → ' ', trim
normalize(s: string): string
  // s.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').replace(/Đ/g,'D')
  //  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
matchesQuery(normTitle: string, query: string): boolean
  // tokens = normalize(query).split(' ').filter(Boolean); empty → true; every token in normTitle
```

### 3.2 drive-api.ts

```ts
export type DriveErrorKind = 'config' | 'not-found' | 'rate-limit' | 'network' | 'http'
export class DriveError extends Error { kind: DriveErrorKind; status?: number }
export interface DriveFile { id: string; name: string; size?: string; modifiedTime: string; md5Checksum?: string; mimeType: string }
createDriveApi(cfg, fetchFn) => {
  listPage(pageToken?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }>,
  mediaUrl(id): string,             // https://www.googleapis.com/drive/v3/files/<id>?alt=media&key=<key>
  downloadUrl(id): string,          // https://drive.google.com/uc?export=download&id=<id>
  fetchRange(id, start, endInclusive): Promise<Uint8Array>,   // header Range: bytes=start-end; expects 206
  fetchBook(id, { size, onProgress?(pct: number), signal? }): Promise<Blob>,  // streams body, pct = floor(loaded/size*100)
}
```

`listPage` URL: `https://www.googleapis.com/drive/v3/files` with params
`q=('<folderId>' in parents and trashed = false)`,
`fields=nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)`,
`pageSize=200`, `orderBy=name`, `supportsAllDrives=true`, `includeItemsFromAllDrives=true`,
`key`. Error mapping: `TypeError` from fetch → `network`; 400/403 whose JSON
`error.errors[0].reason` or `error.details[].reason` is one of `keyInvalid`,
`API_KEY_HTTP_REFERRER_BLOCKED`, `API_KEY_INVALID`, `accessNotConfigured`, `forbidden` →
`config`; 404 → `not-found`; 429 or reason `userRateLimitExceeded`/`rateLimitExceeded` →
`rate-limit`; other → `http`. User messages (Vietnamese) live in one map in this file:
`config` → "Cấu hình Google Drive không hợp lệ", `not-found` → "Không tìm thấy thư mục Google
Drive (thư mục cần được chia sẻ công khai)", `rate-limit` → "Google Drive đang giới hạn
truy cập, thử lại sau", `network` → "Không kết nối được Google Drive", `http` → "Lỗi Google
Drive (<status>)".

### 3.3 Catalog sync

`catalog-repo.ts`

```ts
upsertPage(db, files: DriveFile[], syncStartedAt: number): Promise<{ newIds: string[] }>
  // keep /\.epub$/i only; map fields (size parseInt||0, modifiedTime Date.parse, md5 ?? '');
  // existing rows: overwrite Drive fields, inDrive=1, lastSeenAt=syncStartedAt; newIds = ids not present before
reconcile(db, syncStartedAt): Promise<void>
  // rows with lastSeenAt < syncStartedAt: if bookFiles has it OR progress (deleted=0) has it → inDrive=0
  // else delete books row + covers row. One rw transaction over books, bookFiles, covers, progress.
reattachProgress(db, newIds): Promise<void>
  // for each new book: find progress (deleted=0) with same normTitle whose bookId is
  // missing from books or has inDrive=0; if found and no progress for the new id → copyProgress(old, newId)
```

`catalog-sync.ts`

```ts
export interface CatalogStatus { state: 'idle' | 'syncing' | 'error'; lastSyncAt?: number; error?: string }
export const catalogStatus = signal<CatalogStatus>({ state: 'idle' })   // lastSyncAt also persisted in settings 'catalog.lastSyncAt'
createCatalogSync({ db, api, now = Date.now, onSynced?: () => void }) => {
  sync({ force?: boolean }): Promise<void>,   // single-flight; skips when !navigator.onLine or api null
  start(), stop(),                            // start: load lastSyncAt, sync(); 'online' → sync(); visible & now-lastSyncAt > 5 min → sync()
}
```

Sync body: `t0 = now()`; loop `listPage(token)` → `upsertPage(files, t0)` (collect newIds)
until no token; then `reconcile(t0)`, `reattachProgress(newIds)`, set `lastSyncAt = t0`,
state idle, call `onSynced` (main.tsx wires it to `refreshStale`). Any thrown error →
state `error`, message from DriveError map, nothing reconciled, `lastSyncAt` unchanged.
Retry: `rate-limit`/`network` errors retry after 30 s, 60 s, 120 s (max 3), only while
online. `catalogStatus.error` never fires for offline (offline just skips).

### 3.4 Book cache

```ts
isStale(book: Book | undefined, file: BookFile): boolean
  // !!book && book.inDrive === 1 && !!book.md5 && book.md5 !== file.md5 && book.modifiedTime > file.modifiedTime
type GetResult = { blob: Blob; md5: string; usedOld: boolean }
getBookFile(db, api, bookId, { onProgress, online = navigator.onLine }): Promise<GetResult>
  // file = bookFiles.get; book = books.get
  // file && !isStale → touch lastOpenedAt, return
  // file && stale && online → try download+store → return new; catch → return old with usedOld:true
  // file && stale && !online → old, usedOld:true
  // !file && !online → throw CacheError('offline')
  // !file → download+store (throws CacheError('network'|'quota'|'not-found'))
storeBookFile(db, book, blob)   // put row; QuotaExceededError → CacheError('quota'); first ever store → requestPersistence()
refreshStale(db, api): Promise<void>   // single-flight; serial over stale rows; skip if offline; errors swallowed per book (row kept)
deleteCache(db, bookId)   // delete bookFiles row; if book inDrive=0: delete books+covers rows unless progress exists (then keep books row, it is hidden)
deleteAllCache(db)         // deleteCache for every row, one transaction
cacheStats(db): Promise<{ count; bytes; coversBytes; usage?; quota?; persisted? }>
```

Library visibility rule (used by the library query): show a book when `inDrive === 1`, or
it has a `bookFiles` row. A local-only book without a file but with progress is hidden.

`refreshStale` and the background queue only re-download books that already have a
`bookFiles` row. Stale detection is computed, never stored.

### 3.5 Covers

`DriveRangeReader` — zip.js accepts any object with `size` and
`readUint8Array(offset, length)`:

```ts
class DriveRangeReader { constructor(api, id, size) ; size: number; async init() {}
  readUint8Array(offset, length) { return api.fetchRange(id, offset, offset + length - 1) } }
```

zip.js also reads entry data through `reader.readable` (its unexported base class supplies it),
so `DriveRangeReader` exposes a `readable` getter: a `ReadableStream` pulling ≤ 64 KiB chunks via
`readUint8Array` (measured on fixtures: ~3 % of the file is requested).

`settings` rows (`reader.prefs`, `catalog.lastSyncAt`, `storage.persistRequested`) are device-local
state, not synced records: they are written directly, never through the outbox.

`extract-cover.ts`:

```ts
extractCover(input: Blob | DriveRangeReader): Promise<Blob | null>
  // const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } = await import('foliate-js/vendor/zip.js')
  // configure({ useWebWorkers: false }); reader = new ZipReader(input instanceof Blob ? new BlobReader(input) : input)
  // build { entries, loadText, loadBlob, getSize } exactly like foliate view.js makeZipLoader
  // const { EPUB } = await import('foliate-js/epub.js'); const book = await new EPUB(loader).init()
  // return book.getCover()   // null when the EPUB has none
```

zip.js reads the central directory from the end of the file, so a Range reader fetches
only the tail + the cover entry (verified in a unit test by counting bytes requested
< 50 % of size on the fixture).

`downscale.ts`: `createImageBitmap(blob)` → `OffscreenCanvas` (fallback `<canvas>`)
width `min(320, w)` → `convertToBlob({ type: 'image/webp', quality: 0.8 })`, fall back to
JPEG if WebP unsupported. If `createImageBitmap` throws, store the original blob.

`cover-service.ts`:

```ts
createCoverService({ db, api, concurrency = 3 }) => {
  get(book): Promise<Blob | null | undefined>   // undefined = not available now (offline/failed → placeholder, retry later)
}
// 1. covers row with md5 === book.md5 → row.blob
// 2. bookFiles row → extractCover(blob)
// 3. online && api → extractCover(new DriveRangeReader(api, book.id, book.size))
// 4. else undefined (nothing stored)
// steps 2/3 store { bookId, blob: downscaled | null, md5: book.md5, fetchedAt }
// extraction error → undefined, nothing stored
// queue: at most `concurrency` extractions in flight; duplicate requests for the same id share one promise
```

`CoverImage.tsx` observes its element with `IntersectionObserver({ rootMargin: '300px' })`
and calls `get(book)` once intersecting; it creates/revokes an object URL. Placeholder:
`<div>` with `hsl(hash(normTitle) % 360, 45%, 40%)` background and the title in white,
`aria-label` = title.

### 3.6 Progress and restore

`anchor.ts` (pure, unit-tested without foliate):

```ts
export interface RelocateInfo { cfi: string; fraction: number; rangeText: string;
  sectionIndex: number; sectionHref: string; sectionFraction: number }
buildAnchor(info, book: { id; normTitle }, md5): Omit<Progress, 'updatedAt' | 'deleted'>
  // snippet = info.rangeText.replace(/\s+/g,' ').trim().slice(0, 120)
snippetKey(text): string     // normalize(text).slice(0, 40)  — uses title.ts normalize
export type RestoreStep =
  | { kind: 'cfi'; cfi: string }
  | { kind: 'cfi-if-text'; cfi: string; key: string }
  | { kind: 'snippet'; keys: string[]; sectionHref: string; sectionIndex: number; sectionFraction: number }
    // keys = distinct non-empty [normalize(snippet), first 80, first 40] (longest first)
  | { kind: 'section'; sectionHref: string; sectionIndex: number; sectionFraction: number }
  | { kind: 'fraction'; fraction: number }
planRestore(p: Progress | undefined, md5: string): RestoreStep[]
  // none/deleted → []
  // same md5 → [cfi, fraction]          (fraction as last resort if cfi fails to resolve)
  // different → [cfi-if-text, snippet (only if key non-empty), section, fraction]
```

`foliate-adapter.ts` — wraps `<foliate-view>`; the only file importing `foliate-js/view.js`:

```ts
export interface ReaderAdapter {
  open(file: File): Promise<void>
  sections(): { href: string }[]                         // view.book.sections[i].id
  toc(): { label: string; href: string; subitems?: … }[] // view.book.toc
  goTo(target: string | { index: number; anchor: number }): Promise<boolean>  // false if resolve throws/returns null
  goToFraction(f: number): Promise<void>
  textAt(cfi: string): Promise<string | null>            // resolve cfi → range → toString()
  findInSection(index: number, keys: string[], nearFraction: number): Promise<string | null>
    // load section doc via book.sections[index].createDocument(); build ONE normalised string of the
    // whole body text with a map from each normalised char back to (text node, offset) — normalise
    // char by char with title.ts rules (strip marks, đ→d, lowercase, non-alnum runs → one space);
    // for each key in order (longest first) collect ALL occurrences; first key with ≥ 1 hit wins;
    // pick the occurrence whose start/length-of-string is nearest to nearFraction;
    // collapsed Range at the mapped (node, offset) → view.getCFI(index, range)
  next(): Promise<void>; prev(): Promise<void>
  setPrefs(p: ReaderPrefs): void                          // renderer.setStyles(css) + renderer.setAttribute('max-inline-size','40rem'), 'gap','6%'
  onRelocate(cb: (info: RelocateInfo) => void): () => void
    // view 'relocate' gives cfi, fraction, range, tocItem; view.renderer 'relocate' gives index + fraction (section);
    // remember the latest renderer detail and emit one RelocateInfo per view 'relocate'
  destroy(): void
}
```

`restore.ts`:

```ts
restorePosition(adapter, steps: RestoreStep[]): Promise<RestoreStep['kind'] | 'start'>
  // cfi → adapter.goTo(cfi)
  // cfi-if-text → t = await adapter.textAt(cfi); ok if t && snippetKey(t).startsWith(key) → goTo(cfi)
  // snippet → index = sections().findIndex(s => s.href === sectionHref); if -1 use sectionIndex if < length;
  //           cfi = await findInSection(index, step.keys, step.sectionFraction); cfi && goTo(cfi)
  // section → same index rule; goTo({ index, anchor: sectionFraction })
  // fraction → goToFraction(fraction)  (always succeeds)
  // steps empty → adapter.next() from start; returns 'start'
```

If the result is not `'cfi'` (i.e. the version changed or a fallback ran), ReaderPage saves
immediately after the first relocate following restore.

`progress-repo.ts`:

```ts
getProgress(db, bookId): Promise<Progress | undefined>        // ignores deleted=1
saveProgress(db, anchor): Promise<void>   // rw tx progress+outbox: put {…anchor, id: bookId, updatedAt: now, deleted: 0}; enqueue progress.upsert
copyProgress(db, fromBookId, toBookId): Promise<void>         // same tx pattern, new id/bookId
clearAllProgress(db): Promise<void>       // soft delete each live row; enqueue progress.delete each
```

Save cadence in ReaderPage: debounce 1000 ms on relocate; `flush()` on `pagehide` and
`visibilitychange → hidden` and on unmount.

### 3.7 Reader prefs

```ts
export interface ReaderPrefs { fontScale: number; lineHeight: 1.4 | 1.6 | 1.8; theme: 'light' | 'sepia' | 'dark' }
DEFAULT_PREFS = { fontScale: 1, lineHeight: 1.6, theme: 'light' }
loadPrefs(db), savePrefs(db, p)   // settings key 'reader.prefs'; clamp fontScale to [0.8, 1.6], round to 0.1
prefsCss(p): string               // html { font-size: <scale*100>% ; line-height: … ; color/background per theme }
```

Themes: light `#1f2937 on #ffffff`, sepia `#433422 on #f4ecd8`, dark `#d1d5db on #111827`.
The reader page background matches the theme.

## 4. Routes and UI

### 4.0 Icons and IconButton (decision 0006, /knowledge/ui/icons.md)

```ts
// src/ui/icons/Icon.tsx
const raw = import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export type IconName = 'read' | 'download' | 'cloud-off' | 'refresh' | 'retry' | 'search' | 'close'
  | 'filter-all' | 'filter-saved' | 'library' | 'settings' | 'back' | 'toc' | 'typography'
  | 'font-smaller' | 'font-larger' | 'line-height' | 'theme-light' | 'theme-sepia' | 'theme-dark'
  | 'trash' | 'trash-all' | 'progress-clear' | 'export' | 'import' | 'confirm' | 'update'
export function Icon(p: { name: IconName; class?: string })
  // <span class="inline-flex size-6 shrink-0 [&>svg]:size-full" aria-hidden="true" dangerouslySetInnerHTML={{ __html: raw[`./svg/${name}.svg`] }} />
export function IconButton(p: { icon: IconName; label: string; onClick?; disabled?; variant?: 'plain' | 'primary' | 'danger'; pressed?: boolean; class? })
  // <button type="button" aria-label={label} title={label} aria-pressed={pressed}
  //   class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full
  //          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
  //          disabled:opacity-40 + variant colours"><Icon name={icon} /></button>
export function IconTextButton(p: same + visible text)   // nav items, filter segment, dialog buttons only
```

A unit test asserts every `IconName` has a file and every file is a valid `<svg>` with
`viewBox="0 0 24 24"` and `stroke="currentColor"`. Groups of icon buttons use `gap-2`
(≥ 8 px). Button → icon map is the table in /knowledge/ui/icons.md; labels are the
accessible names used in specs and tests.

`router.ts`: `route` signal parsed from `location.hash`: `{ name: 'library' } |
{ name: 'read', id } | { name: 'settings' }`; unknown → library. `hashchange` updates it.
Library state (query, filter, rendered count) lives in module-level signals so it survives
navigating to the reader and back; scroll position saved in `sessionStorage` key
`library.scrollY` and restored on mount.

### Library (`#/`)

- Top bar: app title "Tủ Truyện", sync badge (`catalogStatus`: "Đang cập nhật…" spinner /
  "Cập nhật <relative time>" / error text in muted colour with a `retry` IconButton "Thử lại"),
  `refresh` IconButton "Làm mới".
- Sticky `SearchBar` (role=searchbox, label "Tìm truyện", `search` icon adornment, `close`
  IconButton "Xoá tìm kiếm" when non-empty, debounce 150 ms) + filter segment
  `IconTextButton`s "Tất cả" (`filter-all`) / "Đã lưu" (`filter-saved`) (role=radiogroup).
- Data: `useLiveQuery` → all books (ordered by normTitle) joined in memory with the sets of
  cached ids, stale ids and progress fractions; filter by visibility rule (3.4), chip and
  `matchesQuery`. In-memory join is fine up to ~20 k books (decision 0005).
- `useIncrementalList(items, step = 40)` returns `{ visible, sentinelRef }`; sentinel uses
  `IntersectionObserver({ rootMargin: '600px' })`; resets count to 40 when query/filter changes.
- Grid: `grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]`.
- `BookCard` (role=article, aria-label = title): CoverImage (aspect-[2/3]), title
  `line-clamp-2`, badges, progress bar (role=progressbar, aria-valuenow), IconButtons `read` "Đọc" (primary) —
  or disabled `cloud-off` "Cần mạng để đọc" — and `download` "Tải" — or disabled
  `cloud-off` "Cần mạng để tải".
- "Tải" handler: cached and (current or offline or inDrive=0) → `URL.createObjectURL(blob)`
  + `<a download={book.name}>` click + revoke; else `location.assign(api.downloadUrl(id))`.
- Online state from `syncStatus.value.online` (existing signal).
- Empty/notice states per ui/library.md.

### Reader (`#/read/:id`)

1. `book = books.get(id)`; missing and no bookFiles row → not-found view.
2. `LoadingOverlay` shows "Đang tải… N%" while `getBookFile` runs; error states per cache spec
   (`offline`, `network` + "Thử lại", `quota` + link `#/settings`).
3. `usedOld` → toast "Đang đọc bản cũ — sẽ cập nhật khi có mạng".
4. `adapter.open(new File([blob], book.name, { type: 'application/epub+zip' }))`,
   `setPrefs(loadPrefs)`, `restorePosition(adapter, planRestore(progress, md5))`.
5. Subscribe relocate → update chrome (% and section label from `tocItem.label`) + debounced save.
6. Tap zones: a transparent overlay is not used (it would block text selection inside the
   iframe); instead listen to foliate's `load` event and add a `click` listener on each
   section `doc`, computing `x / doc.defaultView.innerWidth` relative to the visible column.
   Keyboard listeners on `window` and on each section doc.
7. Chrome IconButtons: `back` "Về thư viện", `toc` "Mục lục", `typography` "Tuỳ chỉnh chữ";
   typography sheet: `font-smaller` "Chữ nhỏ hơn", `font-larger` "Chữ lớn hơn",
   `line-height` "Giãn dòng" (cycles 1.4 → 1.6 → 1.8), `theme-light` "Nền sáng",
   `theme-sepia` "Nền sepia", `theme-dark` "Nền tối" (aria-pressed on the active one).
   Error overlay: `retry` "Thử lại". App update toast: `update` "Cập nhật phiên bản mới".
8. Wide (`lg`): TOC panel open by default in a two-column grid `[20rem_1fr]`.

### Settings (`#/settings`)

All actions are IconButtons per /knowledge/ui/icons.md (refresh, trash, trash-all,
progress-clear, export, import); confirm dialogs use IconTextButtons (`confirm` + "Xoá",
`close` + "Huỷ"). Sections: **Google Drive** (status, last sync, "Làm mới"); **Bộ nhớ** (cached books table/list
sorted by `lastOpenedAt` desc, per-row "Xoá", "Xoá toàn bộ cache" with `confirm` dialog
`<dialog>`, totals, `storage.estimate()`, persisted yes/no); **Tiến độ đọc** ("Xoá tiến độ
đọc" with confirm); **Sao lưu** (Export / Import JSON — existing backup module); app version
(`__APP_VERSION__` define from package.json).

## 5. Service worker

- `globPatterns` unchanged (`**/*.{js,css,html,svg,png,webp,woff2,json}`) — this precaches
  foliate chunks. `maximumFileSizeToCacheInBytes: 3 * 1024 * 1024` in case a chunk is large.
- No runtime caching for Drive: book bytes live in IndexedDB (bookFiles), covers in
  `covers`, catalog in `books`. Drive API responses must not be cached by the SW
  (`navigateFallbackDenylist` irrelevant; just no runtimeCaching entries).
- Vite: `optimizeDeps.exclude: ['foliate-js']` and `build.target: 'es2022'` (foliate uses
  top-level await / private fields). If Rollup warns about the PDF/comic dynamic imports
  pointing to missing `vendor/pdfjs`, add a `resolve.alias` for `foliate-js/vendor/pdfjs/pdf.mjs`
  to an empty stub `src/reader/pdf-stub.ts` (PDF is out of scope).

## 6. Test strategy

Fixtures: `scripts/make-fixtures.mjs` (run by `pretest`/`pretest:e2e`, outputs to
`tests/fixtures/`, git-ignored) builds EPUB 3 files with a small hand-written STORE-only zip writer (CRC-32, local
headers, central directory; no dependency) — every entry uncompressed, `mimetype` first.
Tests read fixtures back with foliate's vendored `vendor/zip.js` (`ZipReader` + `BlobReader`):

- `book-v1.epub`: cover.jpg (tiny valid JPEG, 64×96) declared `properties="cover-image"`,
  nav TOC, 10 chapters `chap001.xhtml…chap010.xhtml` ("Chương 1"…"Chương 10"), each 40
  paragraphs of distinct Vietnamese-ish text (paragraph *n* of chapter *c* starts with
  `"C<c>P<n> "`) so snippets are unique.
- `book-v2.epub`: same as v1 with one extra paragraph inserted at the start of chapter 5 →
  CFIs into chapter 5 shift but snippets remain.
- `book-v3.epub`: v1 with chapter 5's text rewritten (snippets gone, same hrefs).
- `book-v4.epub`: v1 without chapter 5 file and with spine shortened (section gone).
- `book-nocover.epub`: v1 without a cover.

Unit (Vitest + fake-indexeddb + jsdom): title, drive-api (fake fetch), catalog-repo,
catalog-sync (fake api, fake timers, dispatched online/visibility events), book-cache
(fake api returning fixture blobs), anchor/planRestore, restore (fake ReaderAdapter),
progress-repo (outbox assertions), prefs, cover-service (fake extract), extract-cover
(Node: real fixture bytes, Range reader counting bytes), useIncrementalList and components
(mock IntersectionObserver in `tests/setup.ts`).

E2E (Playwright, `vite preview`, projects mobile 375×812 / desktop 1280×800):
`tests/e2e/drive-mock.ts` installs `page.route('https://www.googleapis.com/drive/v3/**')`
serving a configurable fake folder (JSON list pages, `alt=media` with Range support from
fixture files) and `https://drive.google.com/uc**` returning the file with
`Content-Disposition: attachment`. Build for e2e uses `VITE_GD_API_KEY=test
VITE_GD_FOLDER_ID=folder` (set in `playwright.config.ts` `webServer.env` and the build command).

Scenario → test file map:

| scenarios | file |
|---|---|
| catalog.sync.fields, library.search.* (normaliser part) | tests/unit/title.test.ts |
| catalog.sync.config-error (mapping) | tests/unit/drive-api.test.ts |
| catalog.sync.paged, catalog.reconcile.*, catalog.reattach.same-title | tests/unit/catalog-repo.test.ts |
| catalog.trigger.*, catalog.sync.offline, catalog.sync.resync, catalog.sync.config-error, catalog.reconcile.partial-failure | tests/unit/catalog-sync.test.ts |
| cache.fetch.*, cache.persist.removed-from-drive, cache.stale.*, cache.clear.one/all/local-only | tests/unit/book-cache.test.ts |
| library.cover.cached/offline/none/lazy (queue) | tests/unit/cover-service.test.ts |
| library.cover.range | tests/unit/extract-cover.test.ts |
| progress.save.offline/resync, progress.clear.all, progress.backup.roundtrip | tests/unit/progress-repo.test.ts |
| progress.resume.* (planning + restore order with fake adapter) | tests/unit/restore.test.ts |
| reader.prefs.persist (storage) | tests/unit/prefs.test.ts |
| progress.save.relocate/hidden | tests/unit/save-scheduler.test.ts |
| library.grid.incremental/sorted, library.badge.states, library.filter.cached, library.search.empty, library.download.*, library.read.* | tests/unit/library.test.tsx |
| cache.clear.cancel, cache.layout.* (structure) | tests/unit/settings.test.tsx |
| app-shell.config.missing | tests/unit/library.test.tsx |
| app-shell.icons.icon-only, app-shell.icons.labelled-exceptions (unit: Icon/IconButton + set integrity) | tests/unit/icons.test.tsx |
| app-shell.icons.* (pages: icon-only audit, offline, theme, layout) | tests/e2e/icons.spec.ts |
| library.layout.*, app-shell.layout.*, app-shell.routes.reader-fullscreen, library.search.offline | tests/e2e/library.spec.ts |
| reader.open.*, reader.nav.*, reader.chrome.toggle, reader.toc.go, reader.layout.*, reader.prefs.apply | tests/e2e/reader.spec.ts |
| progress.resume.same-version/after-refresh/snippet-gone/section-gone/after-cache-clear/reuploaded, cache.stale.open-online/offline | tests/e2e/resume.spec.ts |
| app-shell.offline.reload, cache.fetch.offline | tests/e2e/offline.spec.ts (extend) |

`save-scheduler`: the debounce/flush logic is extracted into
`src/progress/save-scheduler.ts` — `createSaveScheduler(save, delayMs = 1000)` →
`{ push(anchor), flush() }` — so it is unit-testable with fake timers.

## 7. Risks

- Drive may answer `alt=media` Range requests with 200 (full body) for small files; the
  range reader then slices the full body and caches it for the rest of that extraction.
- Very large EPUBs (> 100 MB) — Drive API `alt=media` still works (no virus-scan page,
  unlike the `uc` link); the `uc` download link may show Google's warning page, accepted.
- iOS Safari storage eviction: mitigated by `persist()` and the install hint (baseline).
