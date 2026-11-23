## ADDED Requirements

### Requirement: Mirror the Drive folder into the local catalog
The app SHALL list the configured public Drive folder with the Drive API v3 and an API key, page by page (200 per page), keep only files whose name ends in `.epub` (case-insensitive), and upsert each page into the `books` table as soon as it arrives, deriving `title`, `normTitle`, `size`, `modifiedTime` and `md5` as defined in /knowledge/data/books.md.

#### Scenario: catalog.sync.paged
- **GIVEN** the folder holds 450 `.epub` files and 3 other files
- **WHEN** a catalog sync runs online
- **THEN** 3 list requests are made, following `nextPageToken`
- **AND** `books` holds 450 rows with `inDrive = 1`
- **AND** rows from the first page are readable before the second request resolves

#### Scenario: catalog.sync.fields
- **GIVEN** Drive returns `{ id: "a", name: "Đấu_Phá  Thương Khung.EPUB", size: "2048", modifiedTime: "2026-11-01T10:00:00.000Z", md5Checksum: "m1" }`
- **WHEN** the page is stored
- **THEN** the row is `{ id: "a", title: "Đấu Phá Thương Khung", normTitle: "dau pha thuong khung", size: 2048, modifiedTime: 1793527200000, md5: "m1", inDrive: 1 }`

### Requirement: Reconcile books that left Drive
After a sync that listed every page without error, the app SHALL treat books not seen in that sync as removed: rows with a cached file or a reading position are kept with `inDrive = 0`; other rows and their covers are deleted. A sync that fails part-way SHALL NOT remove or flag anything.

#### Scenario: catalog.reconcile.keep-cached
- **GIVEN** book "a" is cached and book "b" is not cached and has no position
- **WHEN** a complete sync no longer lists "a" or "b"
- **THEN** "a" has `inDrive = 0` and is still in `books`
- **AND** "b" and its cover row are deleted

#### Scenario: catalog.reconcile.keep-progress
- **GIVEN** book "c" is not cached but has a reading position
- **WHEN** a complete sync no longer lists "c"
- **THEN** "c" stays in `books` with `inDrive = 0`

#### Scenario: catalog.reconcile.partial-failure
- **GIVEN** the second list page fails with a network error
- **WHEN** the sync ends
- **THEN** no row changes `inDrive` and no row is deleted
- **AND** the catalog status shows the error and keeps the previous `lastSyncAt`

#### Scenario: catalog.reconcile.reappear
- **GIVEN** book "a" has `inDrive = 0`
- **WHEN** a sync lists "a" again
- **THEN** "a" has `inDrive = 1`

### Requirement: Re-attach reading position to a re-uploaded book
When a sync stores a book id never seen before whose `normTitle` equals the `normTitle` of a reading position whose book has `inDrive = 0` or no longer exists, the app SHALL copy that position to the new book id (keeping the old one) through the progress repository.

#### Scenario: catalog.reattach.same-title
- **GIVEN** a position exists for book "old" titled "Phàm Nhân Tu Tiên" and "old" is gone from Drive
- **WHEN** a sync adds book "new" whose file is named "Pham Nhan Tu Tien.epub"
- **THEN** a position for "new" exists with the same cfi, snippet, section and fraction as "old"

### Requirement: Sync triggers and status
The app SHALL run a catalog sync on app start, on the `online` event, when the app becomes visible if the last successful sync is older than 5 minutes, and when the user taps refresh. Only one sync SHALL run at a time. It SHALL expose `{ state: 'idle'|'syncing'|'error', lastSyncAt?, error? }` and SHALL NOT run when offline or when config is missing.

#### Scenario: catalog.trigger.single-flight
- **WHEN** refresh is tapped twice while a sync is running
- **THEN** only one sequence of list requests is made

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
- **THEN** a catalog sync runs and new Drive books appear in the library

#### Scenario: catalog.sync.config-error
- **GIVEN** Drive answers 403 with reason `API_KEY_HTTP_REFERRER_BLOCKED`
- **WHEN** a sync runs
- **THEN** the status is `error` with message "Cấu hình Google Drive không hợp lệ" and the stored catalog is unchanged
