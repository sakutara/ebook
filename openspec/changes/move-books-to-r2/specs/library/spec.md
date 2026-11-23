## MODIFIED Requirements

### Requirement: Cover grid with lazy rendering
The library SHALL always show books as a grid of cards (there is no list layout and no layout toggle) sorted by `normTitle`, each card with cover, title (2 lines max), author (1 line, omitted when empty), badges and actions; it SHALL render 40 cards first and 40 more each time a sentinel after the last card comes within 600 px of the viewport.

#### Scenario: library.grid.incremental
- **GIVEN** the catalog holds 130 books
- **WHEN** the library opens
- **THEN** 40 cards are rendered
- **AND** after scrolling to the sentinel 80 cards are rendered, then 120, then 130

#### Scenario: library.grid.sorted
- **GIVEN** books titled "Ánh Trăng", "Bạch Lộc", "an bình"
- **WHEN** the library renders
- **THEN** the order is "an bình", "Ánh Trăng", "Bạch Lộc"

#### Scenario: library.grid.only
- **GIVEN** an older build stored `library.layout = "list"` in localStorage
- **WHEN** the library renders
- **THEN** cards are in the grid with covers and no "Kiểu hiển thị" control exists

#### Scenario: library.layout.narrow
- **WHEN** the viewport is 375 px wide
- **THEN** the grid shows 2 columns, the bottom tab bar is visible, the genre chips scroll sideways inside their own row and the page has no horizontal scroll

#### Scenario: library.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the grid shows at least 6 columns, the side nav is visible, the status filter row sits above, and the genre chips (wrapping, never scrolling) share the next row with the author select on its right

### Requirement: Lazy covers
Every card SHALL show `<base>/books/<id>/cover.jpg?v=<md5>` in an `<img loading="lazy" decoding="async">` with `alt=""` (the title is in the card), without downloading the EPUB. While the image is loading, or when it fails to load (missing, offline and not in the service-worker cache), the card SHALL show the placeholder with the title on a colour derived from `normTitle`. The service worker SHALL cache cover responses CacheFirst (cache `covers`, max 3000 entries, 365 days, status 0 and 200 only). Local-only books (`inDrive = 0`) and books whose id is not a slug (Drive-era rows) SHALL show the placeholder without a request.

#### Scenario: library.cover.remote
- **GIVEN** book "dau-pha" with md5 "m1" is not cached, online
- **WHEN** its card is rendered
- **THEN** its image source is `<base>/books/dau-pha/cover.jpg?v=m1` and no request is made for the EPUB

#### Scenario: library.cover.fallback
- **GIVEN** the cover request for book "b" fails
- **WHEN** the image error event fires
- **THEN** the placeholder with "b"'s title is shown and the broken image is not

#### Scenario: library.cover.offline
- **GIVEN** cover "a" was shown once online, then the device goes offline and the app reloads
- **WHEN** card "a" is rendered
- **THEN** the cover image is shown from the service-worker cache

#### Scenario: library.cover.local-only
- **GIVEN** book "x" has `inDrive = 0`
- **WHEN** its card is rendered
- **THEN** the placeholder is shown and no image request is made

### Requirement: Quick search
The library SHALL filter the catalog as the user types (debounced 150 ms), diacritic- and case-insensitively, keeping books where every whitespace-separated token of the normalised query is contained in `normTitle + " " + normAuthor`; it SHALL work offline and SHALL combine with the "Đã lưu", genre and author filters.

#### Scenario: library.search.diacritics
- **GIVEN** books "Đấu Phá Thương Khung" and "Đế Bá"
- **WHEN** the user types "dau pha"
- **THEN** only "Đấu Phá Thương Khung" is shown

#### Scenario: library.search.tokens
- **WHEN** the user types "khung thuong"
- **THEN** "Đấu Phá Thương Khung" is shown

#### Scenario: library.search.author
- **GIVEN** "Đấu Phá Thương Khung" by "Thiên Tàm Thổ Đậu" and "Đế Bá" by "Yếm Bút Tiêu Sinh"
- **WHEN** the user types "thien tam"
- **THEN** only "Đấu Phá Thương Khung" is shown

#### Scenario: library.search.empty
- **WHEN** the query and filters match nothing
- **THEN** "Không tìm thấy truyện nào" is shown

#### Scenario: library.search.offline
- **GIVEN** the device is offline
- **WHEN** the user searches
- **THEN** results come from the local catalog without any request

#### Scenario: library.filter.cached
- **GIVEN** 3 of 10 books are cached
- **WHEN** the user selects "Đã lưu"
- **THEN** only the 3 cached books are shown, including local-only ones

### Requirement: Download button
The "Tải" icon button SHALL save the EPUB as `<title>.epub` (characters `\/:*?"<>|` replaced by `_`): from the cached blob when the book is cached and (the copy is current or the device is offline or the book is local-only); otherwise it SHALL fetch the book into the cache with a visible progress bar (see "Download progress") and then save that same blob. Offline, it SHALL be disabled for uncached books (accessible name "Cần mạng để tải", `cloud-off` icon).

#### Scenario: library.download.cached
- **GIVEN** book "a" titled "Ánh Trăng" is cached and current
- **WHEN** the user taps "Tải"
- **THEN** a file named "Ánh Trăng.epub" is saved from the blob and no request is made

#### Scenario: library.download.remote
- **GIVEN** book "d" is not cached, online
- **WHEN** the user taps "Tải"
- **THEN** `<base>/books/d/d.epub?v=<md5>` is fetched with a progress bar on the card, stored in `bookFiles`, then saved as a file

#### Scenario: library.download.offline
- **GIVEN** the device is offline
- **THEN** "Tải" is disabled on uncached cards and enabled on cached cards

### Requirement: Read button
The "Đọc" icon button and a tap on the cover SHALL, when the book is cached, navigate to `#/read/<id>`; when it is not cached and online, fetch it into the cache with a visible progress bar first and navigate when done. Offline, on uncached books it SHALL be disabled, show the `cloud-off` icon and have the accessible name "Cần mạng để đọc".

#### Scenario: library.read.navigate
- **GIVEN** book "a" is cached
- **WHEN** the user taps "Đọc" on book "a"
- **THEN** the route becomes `#/read/a` without any request

#### Scenario: library.read.fetch-first
- **GIVEN** book "d" is not cached, online
- **WHEN** the user taps "Đọc"
- **THEN** the card shows the progress bar until the EPUB is stored, then the route becomes `#/read/d`

#### Scenario: library.read.offline-disabled
- **GIVEN** the device is offline and book "d" is not cached
- **THEN** its read button is disabled, shows the `cloud-off` icon and is named "Cần mạng để đọc"

## ADDED Requirements

### Requirement: Download progress
While a book's EPUB is being fetched from the library, its card SHALL replace the Đọc/Tải buttons with a progress bar (`role="progressbar"`, name "Đang tải truyện", 0–100), the text "Đang tải N%" and an icon-only cancel button "Huỷ tải" (`close` icon). When the total size is unknown the bar SHALL be indeterminate with the text "Đang tải…". Only one fetch per book SHALL run at a time.

#### Scenario: library.progress.shown
- **GIVEN** book "d" (2 000 000 bytes) is not cached, online
- **WHEN** the user taps "Đọc" and 500 000 bytes have arrived
- **THEN** the card shows a progressbar with `aria-valuenow=25` and the text "Đang tải 25%"
- **AND** the Đọc and Tải buttons are not shown

#### Scenario: library.progress.indeterminate
- **GIVEN** the response has no `Content-Length` and the catalog size is 0
- **WHEN** bytes arrive
- **THEN** the progressbar has no `aria-valuenow` and the text is "Đang tải…"

### Requirement: Cancel or fail a download
Tapping "Huỷ tải" SHALL abort the request, store nothing and restore the buttons. A failure SHALL show the toast for its kind and restore the buttons.

#### Scenario: library.progress.cancel
- **GIVEN** book "d" is being fetched
- **WHEN** the user taps "Huỷ tải"
- **THEN** the request is aborted, `bookFiles` has no row "d" and the Đọc and Tải buttons come back

#### Scenario: library.progress.error
- **GIVEN** the EPUB request fails with a network error mid-way
- **THEN** the toast "Không tải được truyện, thử lại sau" is shown and the buttons come back

#### Scenario: library.progress.a11y
- **WHEN** a fetch is running
- **THEN** the cancel button has role button and accessible name "Huỷ tải"

### Requirement: Filter by genre
The library SHALL offer a single-select radiogroup "Thể loại" of text chips: "Tất cả thể loại", then Tiên hiệp, Huyền huyễn, Khoa huyễn, then other genres found among listable books (in the catalog or cached) sorted by normalised key; each chip SHALL show its count and chips with 0 books SHALL be hidden. A book matches when one of its genres has the selected normalised key.

#### Scenario: library.filter.genre
- **GIVEN** 5 books: 2 "Tiên hiệp", 2 "Huyền huyễn", 1 with genres ["Khoa huyễn", "Tiên hiệp"]
- **WHEN** the user selects the chip "Tiên hiệp"
- **THEN** 3 books are shown and the chip reads "Tiên hiệp 3"

#### Scenario: library.filter.genre-other
- **GIVEN** one book has genre "Đô thị" and none has "Khoa huyễn"
- **THEN** the chips are "Tất cả thể loại", "Tiên hiệp", "Huyền huyễn", "Đô thị" (those with ≥ 1 book) and no "Khoa huyễn" chip exists

### Requirement: Filter by author
The library SHALL offer a native select "Tác giả" with "Tất cả tác giả" then every non-empty author among listable books, sorted by `normAuthor`, each with its count. A book matches when its `normAuthor` equals the selection.

#### Scenario: library.filter.author
- **GIVEN** 2 books by "Nhĩ Căn" and 1 by "Vong Ngữ"
- **WHEN** the user picks "Nhĩ Căn" in "Tác giả"
- **THEN** only the 2 books by "Nhĩ Căn" are shown

### Requirement: Combine, clear and keep filters
Genre, author, "Tất cả"/"Đã lưu" and search SHALL combine with AND and work offline. When search, genre or author is active, a text button "Xoá bộ lọc" SHALL reset those three. Selections SHALL live in module-level signals so they survive the reader round-trip; a selection that no longer exists SHALL count as "all".

#### Scenario: library.filter.combined
- **GIVEN** "Tiên hiệp" is selected, author "Nhĩ Căn" is selected and "Đã lưu" is on
- **THEN** only cached Tiên hiệp books by Nhĩ Căn are shown

#### Scenario: library.filter.clear
- **GIVEN** a query, a genre and an author are active
- **WHEN** the user taps "Xoá bộ lọc"
- **THEN** all three reset and the full list is shown

#### Scenario: library.filter.persist
- **GIVEN** genre "Huyền huyễn" is selected
- **WHEN** the user opens a book and goes back
- **THEN** "Huyền huyễn" is still selected

#### Scenario: library.filter.offline
- **GIVEN** the device is offline
- **WHEN** the user changes genre and author
- **THEN** the list updates with no request

#### Scenario: library.filter.a11y
- **WHEN** the library renders
- **THEN** the genre chips are radios in a radiogroup named "Thể loại" and the author select is named "Tác giả"
