## MODIFIED Requirements

### Requirement: Mirror the Drive folder into the local catalog
The app SHALL fetch `<VITE_R2_BASE_URL>/catalog.json` with `cache: 'no-cache'`, validate it (`schema === 1`, `books` is an array, each entry has string `id`, `title`, `epub`, `md5` and number `size`; invalid entries are skipped), and upsert every valid entry into `books` in one transaction: `id`, `name = epub`, `title`, `normTitle = normalize(title)`, `author` (default `""`), `normAuthor = normalize(author)`, `genres` (default `[]`, trimmed, empty strings dropped), `description` (default `""`), `size`, `md5`, `modifiedTime = Date.parse(updatedAt) || 0`, `inDrive = 1`, `lastSeenAt` and `updatedAt` = sync start time.

#### Scenario: catalog.sync.single-request
- **GIVEN** `catalog.json` lists 450 books
- **WHEN** a catalog sync runs online
- **THEN** exactly one request is made, to `<base>/catalog.json`
- **AND** `books` holds 450 rows with `inDrive = 1`

#### Scenario: catalog.sync.fields
- **GIVEN** the catalog entry `{ id: "dau-pha", title: "Đấu Phá", author: "Thiên Tàm", genres: ["Huyền huyễn", " "], epub: "dau-pha.epub", size: 2048, md5: "m1", updatedAt: "2026-11-01T10:00:00.000Z" }`
- **WHEN** it is stored
- **THEN** the row is `{ id: "dau-pha", name: "dau-pha.epub", title: "Đấu Phá", normTitle: "dau pha", author: "Thiên Tàm", normAuthor: "thien tam", genres: ["Huyền huyễn"], description: "", size: 2048, md5: "m1", modifiedTime: 1793527200000, inDrive: 1 }`

#### Scenario: catalog.sync.invalid
- **GIVEN** `catalog.json` is not JSON, or has `schema: 2`
- **WHEN** a sync runs
- **THEN** the status is `error` with "Dữ liệu thư viện không hợp lệ" and `books` is unchanged

#### Scenario: catalog.sync.missing
- **GIVEN** `catalog.json` answers 404
- **WHEN** a sync runs
- **THEN** it is treated as an empty catalog (`books: []`) and the status is `idle`

### Requirement: Reconcile books that left Drive
After a successful sync, the app SHALL treat books not in that catalog as removed: rows with a cached file or a live reading position are kept with `inDrive = 0`; other rows are deleted. A failed sync SHALL NOT remove or flag anything.

#### Scenario: catalog.reconcile.keep-cached
- **GIVEN** book "a" is cached and book "b" is not cached and has no position
- **WHEN** a successful sync no longer lists "a" or "b"
- **THEN** "a" has `inDrive = 0` and is still in `books`
- **AND** "b" is deleted

#### Scenario: catalog.reconcile.keep-progress
- **GIVEN** book "c" is not cached but has a reading position
- **WHEN** a successful sync no longer lists "c"
- **THEN** "c" stays in `books` with `inDrive = 0`

#### Scenario: catalog.reconcile.failure
- **GIVEN** the catalog request fails with a network error
- **WHEN** the sync ends
- **THEN** no row changes `inDrive` and no row is deleted
- **AND** the catalog status shows the error and keeps the previous `lastSyncAt`

#### Scenario: catalog.reconcile.reappear
- **GIVEN** book "a" has `inDrive = 0`
- **WHEN** a sync lists "a" again
- **THEN** "a" has `inDrive = 1`

### Requirement: Re-attach reading position to a re-uploaded book
For each book id stored by a sync that had no row before, the app SHALL look for a *gone* book (row with `inDrive = 0` after reconcile) and: (1) if a gone book has a cached file whose `md5` equals the new book's `md5`, move that file to the new id (same blob, `md5`, `cachedAt`, `lastOpenedAt`; `modifiedTime` = new book's), copy its live position to the new id when the new id has none, then delete the gone book's row, file and position; (2) otherwise, when the new id has no position, copy the most recently updated live position whose `normTitle` equals the new book's `normTitle` and whose book is gone or missing (unchanged rule). This carries Drive-era caches over to R2 slugs.

#### Scenario: catalog.reattach.same-title
- **GIVEN** a position exists for book "old" titled "Phàm Nhân Tu Tiên" and "old" is gone
- **WHEN** a sync adds book "pham-nhan-tu-tien" titled "Phàm Nhân Tu Tiên"
- **THEN** a position for "pham-nhan-tu-tien" exists with the same cfi, snippet, section and fraction as "old"

#### Scenario: catalog.reattach.same-file
- **GIVEN** Drive-era book "1AbC" is cached with md5 "m1", has a position at 0.4, and is not in the R2 catalog
- **WHEN** a sync adds book "dau-pha" with md5 "m1" and a different title
- **THEN** `bookFiles` holds "dau-pha" with the old blob and no row for "1AbC"
- **AND** the position for "dau-pha" has fraction 0.4
- **AND** `books` has no row "1AbC", so the library shows one card, "dau-pha", badge "Đã lưu"

### Requirement: Sync triggers and status
The app SHALL run a catalog sync on app start, on the `online` event, when the app becomes visible if the last successful sync is older than 5 minutes, and when the user taps refresh. Only one sync SHALL run at a time. It SHALL expose `{ state: 'idle'|'syncing'|'error', lastSyncAt?, error? }`, SHALL NOT run when offline or when `VITE_R2_BASE_URL` is missing, and SHALL retry after 30 s, 60 s and 120 s on network errors, 429 and 5xx.

#### Scenario: catalog.trigger.single-flight
- **WHEN** refresh is tapped twice while a sync is running
- **THEN** only one catalog request is made

#### Scenario: catalog.trigger.visible-throttle
- **GIVEN** the last successful sync was 2 minutes ago
- **WHEN** the app becomes visible
- **THEN** no sync runs
- **AND** after 6 minutes, becoming visible runs a sync

#### Scenario: catalog.sync.offline
- **GIVEN** the device is offline
- **WHEN** the app starts
- **THEN** no request is made, the library shows the stored catalog and the status is not an error

#### Scenario: catalog.sync.resync
- **GIVEN** the app started offline
- **WHEN** the `online` event fires
- **THEN** a catalog sync runs and new books appear in the library

#### Scenario: catalog.sync.server-error
- **GIVEN** the Worker answers 503
- **WHEN** a sync runs
- **THEN** the status is `error` with "Máy chủ truyện đang bận, thử lại sau", the stored catalog is unchanged and a retry is scheduled after 30 s
