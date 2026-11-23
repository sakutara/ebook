## ADDED Requirements

### Requirement: Cache a book on first read
When a book that is not cached is opened online, the app SHALL download it with `GET files/<id>?alt=media&key=…`, report progress as a percentage of `size`, and store the blob with the Drive `md5` and `modifiedTime` in `bookFiles` only after the download completes. On the first successful cache write it SHALL call `navigator.storage.persist()` once.

#### Scenario: cache.fetch.first-read
- **GIVEN** book "a" (size 1 000 000) is not cached, online
- **WHEN** the reader opens "a"
- **THEN** the loading overlay shows increasing percentages
- **AND** `bookFiles` holds "a" with the book's md5 and modifiedTime
- **AND** a second open makes no request

#### Scenario: cache.fetch.interrupted
- **GIVEN** the network drops halfway through downloading "a"
- **WHEN** the download fails
- **THEN** nothing is stored for "a" and the overlay shows "Không tải được truyện" with "Thử lại"

#### Scenario: cache.fetch.quota
- **GIVEN** storing the blob throws `QuotaExceededError`
- **THEN** the overlay shows "Bộ nhớ đầy — hãy xoá bớt truyện đã lưu" with a link to Settings

#### Scenario: cache.fetch.offline
- **GIVEN** the device is offline and "a" is not cached
- **WHEN** `#/read/a` is opened directly
- **THEN** the reader shows "Cần kết nối mạng để tải truyện này lần đầu" and makes no request

### Requirement: Cache outlives Drive
A cached book SHALL stay readable and downloadable after it is removed from Drive, until the user deletes its cache.

#### Scenario: cache.persist.removed-from-drive
- **GIVEN** book "a" is cached and a complete catalog sync no longer lists it
- **WHEN** the user opens "a"
- **THEN** it opens from the cache and the card shows "Chỉ còn trên máy"

### Requirement: Detect stale copies
A cached copy SHALL be stale when the book is in Drive, its Drive md5 differs from the cached md5, and its Drive `modifiedTime` is later than the cached `modifiedTime`.

#### Scenario: cache.stale.detect
- **GIVEN** cached "a" has md5 "m1", modifiedTime T
- **WHEN** a sync stores "a" with md5 "m2" and modifiedTime T + 1 h
- **THEN** "a" is stale
- **AND** with md5 "m2" but modifiedTime T − 1 h it is not stale

### Requirement: Refresh stale copies in the background
After each successful catalog sync the app SHALL refresh stale copies one at a time while online, replacing the blob only after the new download completes.

#### Scenario: cache.stale.background-refresh
- **GIVEN** books "a" and "b" are stale, online
- **WHEN** the catalog sync finishes
- **THEN** "a" and "b" are re-downloaded one after the other and their `bookFiles` rows carry the new md5
- **AND** neither card shows "Có bản mới" afterwards

#### Scenario: cache.stale.resync
- **GIVEN** "a" became stale while offline
- **WHEN** the device comes back online
- **THEN** the catalog sync runs and "a" is refreshed in the background

#### Scenario: cache.stale.refresh-fails
- **GIVEN** a background refresh of "a" fails
- **THEN** the old blob is kept and "a" is still stale

### Requirement: Open a stale book
Opening a stale book online SHALL download the new version before rendering; if that fails, or offline, it SHALL open the old copy and show "Đang đọc bản cũ — sẽ cập nhật khi có mạng".

#### Scenario: cache.stale.open-online
- **GIVEN** "a" is stale, online
- **WHEN** the user opens "a"
- **THEN** the new version is downloaded, stored and rendered

#### Scenario: cache.stale.offline
- **GIVEN** "a" is stale and the device is offline
- **WHEN** the user opens "a"
- **THEN** the old copy is rendered and the notice "Đang đọc bản cũ — sẽ cập nhật khi có mạng" is shown

### Requirement: Clear the cache
Settings SHALL list cached books with size and last-opened date, total cache size and `navigator.storage.estimate()` usage, and SHALL let the user delete one book's cache or all cached books (after a confirm dialog). Deleting the cache SHALL NOT delete reading positions. Deleting the cache of a local-only book SHALL also remove it from the catalog unless it has a reading position (it then stays hidden: not shown in the library).

#### Scenario: cache.clear.one
- **GIVEN** "a" and "b" are cached
- **WHEN** the user deletes the cache of "a"
- **THEN** `bookFiles` holds only "b" and the position of "a" is unchanged

#### Scenario: cache.clear.all
- **WHEN** the user taps "Xoá toàn bộ cache" and confirms
- **THEN** `bookFiles` is empty, `progress` is unchanged and the totals show 0

#### Scenario: cache.clear.cancel
- **WHEN** the user taps "Xoá toàn bộ cache" and cancels
- **THEN** nothing is deleted

#### Scenario: cache.clear.local-only
- **GIVEN** "c" is local-only, cached, with no position
- **WHEN** the user deletes its cache
- **THEN** "c" is removed from `books` and `covers` and disappears from the library

#### Scenario: cache.layout.narrow
- **WHEN** Settings is shown at 375 px
- **THEN** the cached-books list is a single column with each delete button ≥ 44 px

#### Scenario: cache.layout.wide
- **WHEN** Settings is shown at 1280 px
- **THEN** the cached-books list is a table with title, size, last opened and delete columns
