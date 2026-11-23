# Design — move-books-to-r2

Read first: [R2 source](/knowledge/domain/r2-source.md) (bucket layout, schemas, Worker API),
[Genre](/knowledge/domain/genre.md), [0008](/knowledge/decisions/0008-r2-worker-book-source.md).

Archive order: `add-ebook-library-reader` and `add-donate-and-story-request` must be archived
before this change (its MODIFIED deltas target their specs).

## 1. Worker (`worker/`)

```
worker/
  wrangler.toml          # name = "tu-truyen", main = "src/index.ts", compatibility_date = "2026-11-01"
                         # [[r2_buckets]] binding = "BOOKS", bucket_name = "tu-truyen"
                         # [vars] ADMIN_ORIGINS = "http://localhost:5174"
                         # secret ADMIN_TOKEN set with `wrangler secret put ADMIN_TOKEN`
  tsconfig.json          # types: ["@cloudflare/workers-types"], not referenced by the root tsconfig
  src/index.ts           # export default { fetch: (req, env, ctx) => handle(req, env, ctx, caches.default) }
  src/handler.ts         # pure logic, no Cloudflare globals
```

`src/handler.ts`:

```ts
export interface BucketObject { key: string; size: number; etag: string; httpEtag: string; uploaded: Date;
  httpMetadata?: { contentType?: string }; range?: { offset: number; length: number } }
export interface BucketObjectBody extends BucketObject { body: ReadableStream; text(): Promise<string> }
export interface Bucket {           // structural subset of R2Bucket
  get(key: string, opts?: { range?: { offset: number; length?: number }; onlyIf?: { etagDoesNotMatch?: string } })
    : Promise<BucketObjectBody | BucketObject | null>   // BucketObject (no body) when onlyIf failed
  head(key: string): Promise<BucketObject | null>
  put(key: string, body: ReadableStream | ArrayBuffer | string,
      opts?: { httpMetadata?: { contentType?: string }; onlyIf?: { etagMatches?: string } })
    : Promise<BucketObject | null>                      // null when onlyIf failed
  delete(key: string): Promise<void>
  list(opts: { prefix?: string; cursor?: string; limit?: number })
    : Promise<{ objects: BucketObject[]; truncated: boolean; cursor?: string }>
}
export interface Env { BOOKS: Bucket; ADMIN_TOKEN: string; ADMIN_ORIGINS: string }
export interface EdgeCache { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> }
export async function handle(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, cache: EdgeCache): Promise<Response>
```

Routing in `handle`:

| path | methods | notes |
|---|---|---|
| `OPTIONS *` | — | admin paths: 204 + CORS for allowed origin (403 otherwise); public: 204 + `*` |
| `/catalog.json`, `/books/**` | GET, HEAD | public; other methods 405 |
| `/admin/list` | GET | auth |
| `/admin/<key>` | PUT, DELETE | auth + key whitelist |
| anything else | — | 404 |

- Content types by extension: `.json` → `application/json; charset=utf-8`, `.jpg` → `image/jpeg`, `.epub` → `application/epub+zip`.
- `Cache-Control`: `catalog.json` → `public, max-age=60`; `books/**` with `v` param → `public, max-age=31536000, immutable`; `books/**` without `v` → `public, max-age=300`.
- Range: parse only `bytes=a-b`, `bytes=a-`, `bytes=-n` (single range). Unsatisfiable → 416 with `Content-Range: bytes */size`.
- `If-None-Match` equal to `httpEtag` → 304 (use `head`, no body read).
- `download=1` on an `.epub`: read `books/<slug>/metadata.json` (`text()` → JSON → `title`); filename = `title + ".epub"` or the key's file name on any error; header `attachment; filename*=UTF-8''${encodeURIComponent(name)}`.
- Edge cache: only GET, status 200, has `v`, no `Range`, no `download`. On hit return the cached response. On miss, `ctx.waitUntil(cache.put(req, res.clone()))`.
- Auth: `Authorization === "Bearer " + env.ADMIN_TOKEN` compared with a constant-time loop; empty `ADMIN_TOKEN` → always 401.
- Origin: `ADMIN_ORIGINS.split(',').map(trim)`; missing `Origin` header allowed; disallowed → 403. Admin responses echo `Access-Control-Allow-Origin: <origin>` + `Vary: Origin`.
- Key whitelist regex: `^(catalog\.json|books/([a-z0-9]+(?:-[a-z0-9]+)*)/(cover\.jpg|metadata\.json|\2\.epub))$`.
- PUT body: `req.body` streamed; `If-Match` value passed as `onlyIf.etagMatches` with quotes stripped; `put` returning null → 412. Answer `{ key, etag, size }` JSON.
- list: `limit` 1000; answer `{ objects: [{ key, size, etag, uploaded: ISO }], cursor? }` (`cursor` only when truncated).

Tests run in Node with an in-memory `FakeBucket` (`tests/worker/fake-bucket.ts`) and a `FakeCache` (Map by URL).

## 2. Shared domain code

- `src/domain/slug.ts`: `slugify(title: string): string` = `normalize(title).replace(/ /g, '-')`, cut to ≤ 80 chars at the last `-` before 80 (or hard cut if none), `''` → `'truyen'`. `isSlug(s): boolean` = `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
- `src/domain/genre.ts`:
  ```ts
  export const KNOWN_GENRES = ['Tiên hiệp', 'Huyền huyễn', 'Khoa huyễn'] as const
  export function genreKey(name: string): string            // normalize(name)
  export function canonicalGenre(name: string): string      // alias → known display name; else trimmed Title Case
  export function genresFromSubjects(subjects: string[]): string[]  // canonical, deduped by key, order kept
  ```
  Aliases per [Genre](/knowledge/domain/genre.md).
- `src/domain/file-name.ts`: `epubFileName(title: string): string` = `title.trim().replace(/[\\/:*?"<>|]/g, '_') || 'truyen'` + `.epub`.

## 3. Config

`src/config.ts`: remove `DriveConfig`/`getDriveConfig`; add

```ts
export interface R2Config { baseUrl: string }   // no trailing slash
export function getR2Config(env = import.meta.env): R2Config | null  // VITE_R2_BASE_URL, http(s) only, else null
```

`.env.example`: replace the two `VITE_GD_*` lines with
`# Cloudflare Worker that serves the R2 bucket, e.g. https://tu-truyen.<account>.workers.dev` / `VITE_R2_BASE_URL=`.
`vite-env.d.ts` and `playwright.config.ts` env: `VITE_R2_BASE_URL: 'https://r2.test'`.

## 4. Data (Dexie v4)

```ts
export interface Book {
  id: string; name: string; title: string; normTitle: string;
  author: string; normAuthor: string; genres: string[]; description: string;
  size: number; modifiedTime: number; md5: string; inDrive: 0 | 1; lastSeenAt: number; updatedAt: number
}
```

`inDrive` keeps its name (no index rename) and now means "in the R2 catalog".

```ts
this.version(4).stores({
  settings: 'key', outbox: 'id, createdAt',
  books: 'id, normTitle, inDrive, lastSeenAt',
  bookFiles: 'bookId, cachedAt, lastOpenedAt',
  covers: null,                                   // dropped
  progress: 'id, bookId, normTitle, updatedAt',
  storyRequests: 'id, &key, createdAt',
}).upgrade(tx => tx.table('books').toCollection().modify(b => {
  b.author ??= ''; b.normAuthor ??= ''; b.genres ??= []; b.description ??= ''
}))
```

Remove `Cover` and `covers` from `AppDB`. `reconcile`, `deleteCache`, `deleteAllCache`,
`cacheStats` stop touching covers; `cacheStats` returns `{ count, bytes }`.

## 5. Source (`src/source/r2-source.ts`)

```ts
export type SourceErrorKind = 'invalid' | 'not-found' | 'server' | 'network' | 'http'
export const SOURCE_ERROR_MESSAGES: Record<SourceErrorKind, string> = {
  invalid: 'Dữ liệu thư viện không hợp lệ',
  'not-found': 'Không tìm thấy truyện',
  server: 'Máy chủ truyện đang bận, thử lại sau',
  network: 'Không kết nối được máy chủ truyện',
  http: 'Lỗi máy chủ truyện',
}
export class SourceError extends Error { readonly kind: SourceErrorKind; readonly status?: number }

export interface CatalogEntry { id: string; title: string; author?: string; genres?: string[];
  description?: string; epub: string; size: number; md5: string; updatedAt?: string }

export interface BookSource {
  fetchCatalog(): Promise<CatalogEntry[]>           // 404 → []; bad JSON/schema → SourceError('invalid')
  coverUrl(b: Pick<Book, 'id' | 'md5'>): string     // `${base}/books/${id}/cover.jpg?v=${md5}`
  epubUrl(b: Pick<Book, 'id' | 'name' | 'md5'>): string   // `${base}/books/${id}/${name}?v=${md5}`
  fetchBook(b: Pick<Book, 'id' | 'name' | 'md5' | 'size'>,
    opts?: { onProgress?: (pct: number | null) => void; signal?: AbortSignal }): Promise<Blob>
}
export function createR2Source(cfg: R2Config, fetchFn?: typeof fetch): BookSource
```

- `fetchCatalog` uses `{ cache: 'no-cache' }`. Status mapping: 404 → `[]` (catalog only) / `not-found` (book); 429 or ≥ 500 → `server`; other non-ok → `http`; thrown fetch → `network` (AbortError rethrown).
- Entry validation: object with string `id` (must pass `isSlug`), string `title` (non-empty after trim), string `epub`, string `md5`, finite number `size` ≥ 0. Invalid entries are dropped silently; a non-array `books` or `schema !== 1` → `invalid`.
- `fetchBook` streams `res.body`; total = `Number(res.headers.get('Content-Length'))` if > 0, else `b.size` if > 0, else unknown. Calls `onProgress(pct)` when pct increases, or `onProgress(null)` once at the first chunk when unknown; `onProgress(100)` at the end when known. A stream read error → `network`. Returns `Blob([...chunks], { type: 'application/epub+zip' })`.

## 6. Catalog

`src/catalog/catalog-repo.ts`:

```ts
export async function upsertCatalog(db, entries: CatalogEntry[], syncStartedAt: number): Promise<{ newIds: string[] }>
export async function reconcile(db, syncStartedAt: number): Promise<void>          // unchanged rule, no covers
export async function reattach(db, newIds: string[], now: number): Promise<void>   // replaces reattachProgress
```

`reattach` per new id, in order:
1. `gone` = books with `inDrive = 0` (after reconcile). Find a gone book whose `bookFiles` row has `md5 === newBook.md5`. If found (first by `lastOpenedAt` desc): in one `rw` transaction over books, bookFiles, progress:
   put `bookFiles` row `{ ...old, bookId: newId, modifiedTime: newBook.modifiedTime }`, delete old file row;
   if the new id has no live position and the old one has one → `copyProgress(db, oldId, newId)`;
   delete the old position row directly (`db.progress.delete(oldId)`, no outbox entry — it is a local id rename), delete the old book row. Continue to the next id.
2. Otherwise run the existing same-normTitle position copy.

`catalog-sync.ts`: dependency `source: BookSource | null` instead of `api`. `run` = `fetchCatalog` → `upsertCatalog` → `reconcile` → `reattach` → save `lastSyncAt`. Error message = `SourceError.message`, otherwise `'Không kết nối được máy chủ truyện'`. Retry for kinds `network` and `server`.

## 7. Cache

`CacheDeps = { db, source: BookSource | null, online?, now?, persist? }`. `download()` calls
`source.fetchBook(book, opts)`; maps `SourceError('not-found')` → `CacheError('not-found')`,
AbortError rethrown, other → `CacheError('network')`. `onProgress` type becomes
`(pct: number | null) => void` throughout (`getBookFile`, ReaderPage, LibraryPage).

## 8. UI

### Components

- `src/ui/ProgressBar.tsx` (new):
  `ProgressBar({ percent, label = 'Đang tải truyện' }: { percent: number | null; label?: string })`
  renders `<div class="flex items-center gap-2">` + `<div role="progressbar" aria-label={label} aria-valuemin=0 aria-valuemax=100 aria-valuenow={percent ?? undefined} class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">` with an inner bar (`width: percent%`, `bg-accent`, `transition-[width]`) or, when `percent === null`, a 40 %-wide bar with `animate-[progress-indeterminate_1.2s_ease-in-out_infinite] motion-reduce:animate-none` (keyframes added to `src/styles/app.css`), then `<span class="text-fluid-sm tabular-nums text-ink-muted">` "Đang tải N%" / "Đang tải…".
- `CoverImage` new props: `{ book: { title, normTitle }, src?: string, class? }`. Placeholder always rendered underneath; when `src` is set, an `<img src alt="" loading="lazy" decoding="async" class="absolute inset-0 size-full object-cover">` is layered on top, hidden (`invisible`) until `load`, removed on `error`. Resets when `src` changes. No IntersectionObserver, no blobs (native lazy loading).
- `BookCard` props: `{ card, online, coverUrl?: string, progress?: number | null | undefined, onRead, onDownload, onCancel }` (`progress === undefined` = idle). Always grid. Cover click → `onRead` when `canRead`. Under the title: author in `text-fluid-sm text-ink-muted truncate` when non-empty. When `progress !== undefined`: `ProgressBar` + `IconButton icon="close" label="Huỷ tải" onClick={onCancel}` replace the two buttons.

### State and model

- `library-state.ts`: remove `Layout`, `layout`, `setLayout`, `LAYOUT_KEY` usage (leave the old localStorage key untouched). Add `genre = signal<string>('')` (genre key, `''` = all) and `author = signal<string>('')` (normAuthor, `''` = all), and `clearFilters()` resetting `query`, `genre`, `author`.
- `library-model.ts`:
  ```ts
  export interface CardFilters { q: string; saved: boolean; genre: string; author: string }
  export function buildCards(books, files, progress, filters: CardFilters): CardModel[]
  export function listable(cards: CardModel[]): CardModel[]   // cached || inDrive === 1
  export interface Option { value: string; label: string; count: number }
  export function genreOptions(books: Book[], cachedIds: Set<string>): Option[]  // known first (fixed order), then others by key
  export function authorOptions(books: Book[], cachedIds: Set<string>): Option[] // non-empty, by normAuthor
  ```
  Search haystack = `normTitle + ' ' + normAuthor` via `matchesQuery`. A `genre`/`author` value that has no option is ignored (treated as `''`).

### LibraryPage

- Remove the "Kiểu hiển thị" radiogroup and the list branch. Grid class unchanged.
- Toolbar (top to bottom on narrow; from `md:` the status row, then chips + select side by side — see §11):
  1. `SearchBar`
  2. row: "Tất cả"/"Đã lưu" radiogroup · status line · retry/refresh (unchanged)
  3. genre radiogroup `aria-label="Thể loại"`: `<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">` of chip buttons `role="radio" aria-checked` (text, not icons — filter chips are a labelled exception per /knowledge/ui/icons.md), label `"<name> <count>"`, first chip "Tất cả thể loại".
  4. `<select aria-label="Tác giả" class="min-h-11 w-full rounded-lg bg-surface-2 px-3 text-fluid-base lg:w-auto">` with `<option value="">Tất cả tác giả</option>` + options `"<author> (<count>)"`.
  5. "Xoá bộ lọc" text button when `query || genre || author`.
- Fetch state: `const [fetching, setFetching] = useState<Record<string, number | null>>({})` and `const controllers = useRef(new Map<string, AbortController>())`. `startFetch(card, then)` creates an AbortController, sets `fetching[id] = 0`, calls `getBookFile({ db, source }, id, { onProgress, signal })`, then runs `then(blob)`; on AbortError just clears; on error toasts `cacheErrorText(e)`; always clears state and controller. `onCancel(id)` aborts the controller.
- `cacheErrorText` network text becomes "Không tải được truyện, thử lại sau".
- Download name: `epubFileName(book.title)`; the offline/no-source fallback `location.assign(drive…)` is removed (button is disabled in that case).
- `coverUrl` for a card = `source && book.inDrive === 1 && isSlug(book.id) ? source.coverUrl(book) : undefined`.
- Not-configured notice text: "Chưa cấu hình máy chủ truyện".

### ReaderPage

Loading view uses `<ProgressBar percent={view.percent ?? null} />` centred (`max-w-xs w-full`); `percent` state type `number | null | undefined` (`undefined` before the first chunk shows 0 %).

### SettingsPage

Section id `settings-source`, heading "Máy chủ truyện", line 1 = `new URL(config.baseUrl).host` (or "Chưa cấu hình"), line 2 = existing status text. Storage line drops covers bytes.

### Services

`Services = { db, config: R2Config | null, source: BookSource | null, catalogSync, cacheDeps, }` — `coverService` and `api` removed. Delete `src/drive/**`, `src/covers/**`, and tests `drive-api`, `cover-service`, `extract-cover`.

## 9. Service worker

`vite.config.ts` `workbox.runtimeCaching`:

```ts
{
  urlPattern: ({ url }) => /^\/books\/[a-z0-9-]+\/cover\.jpg$/.test(url.pathname) && url.origin !== self.location.origin,
  handler: 'CacheFirst',
  options: { cacheName: 'covers', expiration: { maxEntries: 3000, maxAgeSeconds: 31536000 },
             cacheableResponse: { statuses: [0, 200] } },
}
```

(Workbox serialises the function into the SW; it must not reference outer variables.)
EPUBs are **not** runtime-cached by the SW — they live in `bookFiles`.

## 10. Icons

No new icons. Reused: `close` (Huỷ tải), `read`, `download`, `cloud-off`, `refresh`, `retry`,
`filter-all`, `filter-saved`. The `toc` icon stays (reader TOC). Genre chips, the author select
and "Xoá bộ lọc" are text controls (filter/selection exception in /knowledge/ui/icons.md).

## 11. Responsive

| width | toolbar | grid |
|---|---|---|
| 360–767 | stacked rows; genre chips scroll inside their row (`overflow-x-auto`), select full width | 2 cols |
| ≥ 768 | row 1: status filter + status line + refresh; row 2: chips `flex-1 flex-wrap` (no scroll) + select `w-56 shrink-0` on the right | auto-fill 9 rem (≥ 6 cols at 1280) |

## 12. Test plan

| scenarios | test file |
|---|---|
| worker.public.*, worker.range.*, worker.download.*, worker.cache.* | tests/worker/public.test.ts |
| worker.admin.* | tests/worker/admin.test.ts |
| (domain) slug, genre, file name | tests/unit/slug.test.ts, genre.test.ts, file-name.test.ts |
| app-shell.config.missing (config part) | tests/unit/config.test.ts |
| Dexie v4 upgrade | tests/unit/db.v4.test.ts |
| catalog.sync.fields/invalid/missing, cache.fetch.content-length/abort/not-found | tests/unit/r2-source.test.ts |
| catalog.reconcile.*, catalog.reattach.* | tests/unit/catalog-repo.test.ts |
| catalog.sync.single-request/offline/resync/server-error, catalog.trigger.* | tests/unit/catalog-sync.test.ts |
| cache.fetch.* | tests/unit/book-cache.test.ts |
| library.search.*, library.filter.genre/genre-other/author/combined | tests/unit/library-model.test.ts |
| library.progress.*, library.cover.remote/fallback/local-only | tests/unit/book-card.test.tsx, cover-image.test.tsx |
| library.grid.only, library.filter.clear/persist/a11y, library.read.*, library.download.* | tests/unit/library.test.tsx |
| reader.open.progress | tests/unit/reader-page.test.tsx |
| app-shell.config.settings | tests/unit/settings.test.tsx |
| library.layout.*, library.cover.offline, catalog.reattach (e2e smoke), offline | tests/e2e/library.spec.ts, offline.spec.ts with `tests/e2e/r2-mock.ts` |
