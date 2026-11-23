## ADDED Requirements

### Requirement: Cover grid with lazy rendering
The library SHALL show books from the local catalog sorted by `normTitle`, as cards with cover, title (2 lines max), badges and actions; it SHALL render 40 cards first and 40 more each time a sentinel after the last card comes within 600 px of the viewport.

#### Scenario: library.grid.incremental
- **GIVEN** the catalog holds 130 books
- **WHEN** the library opens
- **THEN** 40 cards are rendered
- **AND** after scrolling to the sentinel 80 cards are rendered, then 120, then 130

#### Scenario: library.grid.sorted
- **GIVEN** books titled "Ánh Trăng", "Bạch Lộc", "an bình"
- **WHEN** the library renders
- **THEN** the order is "an bình", "Ánh Trăng", "Bạch Lộc"

#### Scenario: library.layout.narrow
- **WHEN** the viewport is 375 px wide
- **THEN** the grid shows 2 columns, the bottom tab bar is visible and there is no horizontal scroll

#### Scenario: library.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the grid shows at least 6 columns and the side nav is visible

### Requirement: Lazy covers
The app SHALL request a cover only for cards within 300 px of the viewport, at most 3 at a time; it SHALL take the cover from the `covers` table when its `md5` equals the book's, otherwise extract the EPUB's cover image (from the cached file if present, else via HTTP Range reads on Drive), downscale it to ≤ 320 px wide and store it; when the book has no cover or extraction fails it SHALL show a placeholder with the title on a colour derived from `normTitle`.

#### Scenario: library.cover.lazy
- **GIVEN** 40 cards are rendered and 8 are within 300 px of the viewport
- **WHEN** covers load
- **THEN** cover work is started for those 8 only and never more than 3 concurrently

#### Scenario: library.cover.cached
- **GIVEN** `covers` holds a blob for book "a" with the same md5 as the book
- **WHEN** card "a" becomes visible
- **THEN** no network request is made and the stored image is shown

#### Scenario: library.cover.range
- **GIVEN** book "a" is not cached and has no cover row, online
- **WHEN** card "a" becomes visible
- **THEN** the app reads the zip directory and the cover entry with `Range` requests (not the whole file) and stores the downscaled cover

#### Scenario: library.cover.offline
- **GIVEN** the device is offline and book "b" has no cover row and is not cached
- **WHEN** card "b" becomes visible
- **THEN** the placeholder is shown, no request is made and nothing is stored (it is retried when online)

#### Scenario: library.cover.none
- **GIVEN** the EPUB of book "c" declares no cover image
- **WHEN** extraction finishes
- **THEN** a covers row with `blob = null` and the book's md5 is stored and the placeholder is shown

### Requirement: Quick search
The library SHALL filter the catalog as the user types (debounced 150 ms), diacritic- and case-insensitively, keeping books whose `normTitle` contains every whitespace-separated token of the normalised query; it SHALL work offline and SHALL combine with the "Đã lưu" filter.

#### Scenario: library.search.diacritics
- **GIVEN** books "Đấu Phá Thương Khung" and "Đế Bá"
- **WHEN** the user types "dau pha"
- **THEN** only "Đấu Phá Thương Khung" is shown

#### Scenario: library.search.tokens
- **WHEN** the user types "khung thuong"
- **THEN** "Đấu Phá Thương Khung" is shown

#### Scenario: library.search.empty
- **WHEN** the query matches nothing
- **THEN** "Không tìm thấy truyện nào" is shown

#### Scenario: library.search.offline
- **GIVEN** the device is offline
- **WHEN** the user searches
- **THEN** results come from the local catalog without any request

#### Scenario: library.filter.cached
- **GIVEN** 3 of 10 books are cached
- **WHEN** the user selects "Đã lưu"
- **THEN** only the 3 cached books are shown, including local-only ones

### Requirement: Card badges and progress
Each card SHALL show "Đã lưu" for a current cached copy, "Có bản mới" for a stale copy, "Chỉ còn trên máy" for `inDrive = 0`, and, when a reading position exists, a progress bar with `round(fraction × 100)%`.

#### Scenario: library.badge.states
- **GIVEN** book "a" cached current, "b" cached stale, "c" local-only, "d" remote with position fraction 0.426
- **WHEN** the library renders
- **THEN** "a" shows "Đã lưu", "b" shows "Có bản mới", "c" shows "Chỉ còn trên máy", "d" shows "43%"

### Requirement: Download button
The "Tải" icon button SHALL save the EPUB under its Drive file name: from the cached blob when the book is cached and (the copy is current or the device is offline or the book is local-only); otherwise by navigating to `https://drive.google.com/uc?export=download&id=<id>`. Offline, it SHALL be disabled for uncached books (accessible name "Cần mạng để tải", `cloud-off` icon).

#### Scenario: library.download.cached
- **GIVEN** book "a" is cached and current
- **WHEN** the user taps "Tải"
- **THEN** a file named like the Drive file is saved from the blob and no request is made

#### Scenario: library.download.remote
- **GIVEN** book "d" is not cached, online
- **WHEN** the user taps "Tải"
- **THEN** the browser is sent to `https://drive.google.com/uc?export=download&id=d`

#### Scenario: library.download.offline
- **GIVEN** the device is offline
- **THEN** "Tải" is disabled on uncached cards and enabled on cached cards

### Requirement: Read button
The "Đọc" icon button SHALL navigate to `#/read/<id>`. Offline, on uncached books it SHALL be disabled, show the `cloud-off` icon and have the accessible name "Cần mạng để đọc".

#### Scenario: library.read.navigate
- **WHEN** the user taps "Đọc" on book "a"
- **THEN** the route becomes `#/read/a`

#### Scenario: library.read.offline-disabled
- **GIVEN** the device is offline and book "d" is not cached
- **THEN** its read button is disabled, shows the `cloud-off` icon and is named "Cần mạng để đọc"
