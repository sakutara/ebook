# Design — add-r2-deployer

Depends on `move-books-to-r2` (Worker admin API §1, `src/domain/{slug,genre,title}.ts`).

## Layout in the repo

```
deployer/
  index.html                 # <title>R2 Deployer</title>, mounts src/main.tsx
  src/main.tsx, app.tsx      # Preact + Tailwind (same tokens: imports ../../src/styles/app.css)
  src/admin-client.ts        # Worker admin calls
  src/epub-meta.ts           # EPUB → { title, creators[], subjects[], description, language, cover: Blob|null }
  src/cover-jpeg.ts          # Blob → JPEG Blob (resize) | generated cover
  src/md5.ts                 # spark-md5 over ArrayBuffer chunks (2 MB)
  src/draft.ts               # Draft model, status, slug suggestion (pure)
  src/catalog-merge.ts       # read-merge-write with If-Match (pure + client)
  src/upload-queue.ts        # sequential per book, Dừng, Thử lại
  src/ui/*.tsx               # ConnectPanel, DropZone, DraftCard, UploadBar, PublishedTab
vite.deployer.config.ts      # root: 'deployer', server.port 5174, no PWA plugin, envDir: '..'
package.json scripts         # "deployer": "vite --config vite.deployer.config.ts"
```

The main `vite.config.ts` keeps `index.html` as its only input, so nothing from `deployer/`
reaches `dist/` (checked by a unit test that reads the built `dist/` file list after build in
task 6, or by e2e).

## Admin client

```ts
export interface AdminClient {
  check(): Promise<void>                                // GET /admin/list?prefix=books/&limit=1; 401 → AdminError('auth')
  getCatalog(): Promise<{ catalog: Catalog; etag: string | null }>   // public GET, cache: 'no-store'
  put(key: string, body: Blob | string, opts?: { contentType?: string; ifMatch?: string | null;
      onProgress?: (sent: number, total: number) => void; signal?: AbortSignal }): Promise<{ etag: string }>
      // XMLHttpRequest for upload progress; 412 → AdminError('conflict')
  del(key: string): Promise<void>
  list(prefix: string, cursor?: string): Promise<{ objects: { key: string }[]; cursor?: string }>
}
export type AdminErrorKind = 'auth' | 'origin' | 'conflict' | 'network' | 'http'
```

## EPUB parsing

Reuse foliate-js like the old `extract-cover.ts` did (zip.js `BlobReader` + `EPUB.init()`):
`book.metadata` gives `title`, `author` (string | object | array), `subject`, `description`,
`language`; `book.getCover()` gives the cover Blob. Normalise foliate's language-map values
(`{ vi: "…" }`) to the first string.

foliate-js shapes (from `getMetadata` + `tidy` in `node_modules/foliate-js/epub.js`) — every
array of length 1 is **collapsed to its single element**, and empty/null keys are deleted:

| field | possible shapes |
|---|---|
| `title` | `string` \| language map `{ [lang]: string }` \| missing |
| `author` | contributor \| contributor[] \| missing; contributor = `{ name: string \| langMap, sortAs?, role?, … }` or a bare string |
| `subject` | same as author |
| `description` | `string` \| missing (may contain HTML) |
| `language` | `string` \| `string[]` \| missing |

Helpers in `epub-meta.ts`: `text(x)` = string → itself, langMap → first value, contributor →
`text(x.name)`; `list(x)` = missing → `[]`, array → itself, else `[x]`. So
`creators = list(m.author).map(text).filter(Boolean)`, `subjects = list(m.subject).map(text)`.

The fixture generator `scripts/make-fixtures.mjs` gains `book-meta.epub` with
`dc:title` "Phàm Nhân Tu Tiên", `dc:creator` "Vong Ngữ", two `dc:subject` ("Tiên Hiệp",
"xianxia"), `dc:description` `<p>Một <b>phàm nhân</b>…</p>`, `dc:language` "vi" and a cover.

## Draft model

```ts
interface Draft {
  key: string                    // local uuid
  file: File
  state: 'parsing' | 'ready' | 'error' | 'uploading' | 'done'
  error?: string
  title: string; author: string; genres: string[]; description: string; language: string
  slug: string; slugEdited: boolean
  size: number; md5: string
  cover: Blob; coverGenerated: boolean
  status: 'new' | 'update' | 'exists'   // vs catalog
  selected: boolean              // default: status !== 'exists' && state === 'ready'
  progress?: number              // 0–100 while uploading
}
```

`suggestSlug(title, catalogBooks, otherDrafts)`: base = `slugify(title)`; if a catalog book has
the base with the same `normTitle` → keep (update); if taken by a different title or another
draft → first free `base-2`, `base-3`, ….

## Upload order and catalog

Per book: epub → cover → metadata, then `mergeIntoCatalog(client, entry)`:
read (etag) → replace/add by id → sort → `PUT catalog.json` with `ifMatch: etag` (null when
404) → on `conflict` repeat, max 5 attempts → else book error "Không cập nhật được catalog".
Delete: 3 × `del`, then `removeFromCatalog` with the same loop.

## UI

Two tabs: "Tải lên" and "Đã đăng". Connection panel at top (narrow) or left column (≥ 1024).
Draft cards: cover thumb 96×144, fields, genre chips (known genres as toggles + "Khác…" text
field adding a canonicalised genre), status pill, per-book `ProgressBar` (reuse
`src/ui/ProgressBar.tsx` with `label="Đang tải lên"`). Sticky bottom bar: "Tải lên N truyện",
overall progress, "Dừng".

## Test plan

| scenarios | test |
|---|---|
| deployer.extract.* | tests/deployer/epub-meta.test.ts (fixtures from scripts/make-fixtures.mjs, add one with subjects) |
| deployer.cover.* | tests/deployer/cover-jpeg.test.ts (canvas mocked: assert target size + generated flag) |
| deployer.review.* | tests/deployer/draft.test.ts |
| deployer.catalog.* | tests/deployer/catalog-merge.test.ts |
| deployer.upload.* | tests/deployer/upload-queue.test.ts (fake AdminClient) |
| deployer.connect.*, deployer.pick.*, deployer.manage.* | tests/deployer/app.test.tsx |
| deployer.build.excluded | tests/deployer/build-excluded.test.ts (reads vite.config input) |
| deployer.layout.* | tests/e2e/deployer.spec.ts (own webServer on 5174 with a mocked Worker) |

## Overwrite guard

`computeStatus` returns `update` whenever the slug exists with another md5. When the catalog
book with that slug has a different `normTitle` from the draft, the draft is a **conflict**:
`conflictTitle(draft, catalog): string | null` returns the existing title. The card then shows
the warning "Sẽ ghi đè «<title>»" in the danger colour and the draft starts unselected
(the owner can still tick it on purpose).

## Store and upload queue

`deployer/src/upload-queue.ts` (pure, no DOM):

```ts
export interface QueueDeps {
  client: AdminClient
  now?: () => Date
  shouldStop?: () => boolean                     // checked before each book
  onDraft: (key: string, patch: Partial<Draft>) => void
  online?: () => boolean                         // default navigator.onLine
}
export async function runUpload(drafts: Draft[], deps: QueueDeps): Promise<{ done: number; failed: number; stopped: boolean }>
```
For each `canUpload` draft in order: `onDraft(key, { state: 'uploading', progress: 0, error: undefined })`;
total = epub.size + cover.size + metadata bytes; put epub → cover → metadata (each with
`onProgress` adding to the running sum → `progress = floor(sent/total*100)`); then
`updateCatalog(client, c => mergeEntry(c, meta, now()))`; then `onDraft(key, { state: 'done', progress: 100, status: 'update' })`.
Any error → `onDraft(key, { state: 'error', error: message, progress: undefined })` and continue.
Offline at start → throw `Error('Cần kết nối mạng để tải lên')` before any request.

`deployer/src/store.ts` (`@preact/signals`, module singletons):

| signal | type |
|---|---|
| `conn` | `{ baseUrl: string; token: string; remember: boolean; state: 'idle'\|'checking'\|'ok'\|'error'; error?: string }` — baseUrl default `import.meta.env.VITE_R2_BASE_URL ?? ''`; token from `localStorage['deployer.token']` when present (remember = true) |
| `catalog` | `Metadata[]` |
| `drafts` | `Draft[]` |
| `notice` | `string \| null` (e.g. "Bỏ qua 1 tệp không phải EPUB") |
| `uploading` | `{ running: boolean; stopRequested: boolean; done: number; total: number }` |

Actions: `connect()` (create client, `check()`, `getCatalog()`, store token in localStorage
only when `remember`, else remove the key), `addFiles(files)` (skip non-.epub; add `parsing`
drafts at once; parse with concurrency 2: `md5Hex` → `readEpubMeta` → `makeCover` →
`suggestSlug` → `reviewDraft`; `EpubError` → state `error`), `updateDraft(key, patch)` (title
edits go through `applyTitleEdit`; slug edits set `slugEdited` and recompute status),
`removeDraft(key)`, `startUpload()`, `stopUpload()`, `retry(key)` (sets `state: 'ready', selected: true` then runs the queue for that one), `deleteBook(id)` (3 × `del` then `updateCatalog(removeEntry)`), `rebuildCatalog(onProgress)` (`list('books/')` all pages → keys ending `/metadata.json` → public GET each → `updateCatalog(() => ({ schema: 1, generatedAt, books }))`). After upload/delete/rebuild, `catalog` is refreshed.

## UI components (deployer/src/ui/)

All Vietnamese text, Tailwind tokens from `src/styles/app.css` (`bg-surface`, `bg-surface-2`,
`text-ink`, `text-ink-muted`, `bg-accent`, `text-fluid-*`), controls ≥ 44 px, reuse
`src/ui/ProgressBar.tsx` and `IconButton`/`Icon` from `src/ui/icons/Icon.tsx` where an icon fits
(`close`, `trash`, `retry`, `refresh`, `import`). Components read/write `store` (props take an
optional `store` for tests, default the singleton).

| component | content |
|---|---|
| `App` | header "R2 Deployer"; tabs (role=tablist) "Tải lên" / "Đã đăng"; layout: < 1024 px one column (ConnectPanel on top); ≥ 1024 px `grid grid-cols-[20rem_1fr] gap-6` with ConnectPanel in the left column |
| `ConnectPanel` | `<form>`: input "Địa chỉ Worker" (type url), input "Mã quản trị" (type password, autocomplete off), checkbox "Nhớ trên máy này", button "Kết nối" (disabled while checking); status line: "Đã kết nối · N truyện" / error text (role=alert) |
| `DropZone` | label wrapping `<input type=file multiple accept=".epub,application/epub+zip" class="sr-only">`, text "Chọn hoặc kéo thả tệp EPUB vào đây"; dragover highlight; drop → `addFiles`; notice line under it |
| `DraftCard` | `<article aria-label={title}>`: cover thumb (object URL of `draft.cover`, revoked on unmount) 96×144; checkbox "Chọn" (disabled unless ready); inputs "Tên truyện", "Tác giả", "Thư mục (slug)" with error text under it; genre toggles (`aria-pressed` buttons for KNOWN_GENRES) + input "Thể loại khác" (Enter adds `canonicalGenre(value)`) + removable chips for other genres; status pill: Mới / Cập nhật / Đã có / Lỗi / Đang đọc tệp… / Đã tải lên; "Bìa tự tạo" pill when coverGenerated; conflict warning; while uploading `ProgressBar label="Đang tải lên"`; error → message + IconButton `retry` "Thử lại"; IconButton `close` "Bỏ khỏi danh sách" when not uploading |
| `UploadBar` | sticky bottom (`sticky bottom-0`), shows when drafts exist: button "Tải lên N truyện" (N = canUpload count; disabled when 0, not connected or running), overall `ProgressBar label="Tiến độ chung"` = done/total while running, button "Dừng" while running; offline → text "Cần kết nối mạng để tải lên" and the button disabled |
| `PublishedTab` | search input "Tìm truyện đã đăng"; list of catalog books (cover `<img src={baseUrl}/books/<id>/cover.jpg?v=<md5>>`, title, author, genres, size MB); IconButton `trash` "Xoá" → `<dialog>` confirm "Xoá «title» khỏi R2?" with "Xoá" / "Huỷ"; button "Dựng lại catalog" with progress text "Đang đọc N/M…"; needs connection (otherwise "Hãy kết nối trước") |

Drafts list: `grid gap-4 lg:grid-cols-2`.
