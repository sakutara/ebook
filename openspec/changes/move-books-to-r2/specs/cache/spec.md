## MODIFIED Requirements

### Requirement: Cache a book on first read
When a book that is not cached is opened or downloaded online, the app SHALL fetch `<base>/books/<id>/<name>?v=<md5>` (where `name` is the book's `epub` file name), stream it while reporting progress as `floor(received / total × 100)` with total = response `Content-Length`, else the catalog `size`, else unknown (indeterminate), honour an `AbortSignal`, and store the blob with the catalog `md5` and `modifiedTime` in `bookFiles` only after the download completes. On the first successful cache write it SHALL call `navigator.storage.persist()` once.

#### Scenario: cache.fetch.first-read
- **GIVEN** book "a" (size 1 000 000) is not cached, online
- **WHEN** the reader opens "a"
- **THEN** the loading screen shows a progress bar with increasing percentages
- **AND** `bookFiles` holds "a" with the book's md5 and modifiedTime
- **AND** a second open makes no request

#### Scenario: cache.fetch.content-length
- **GIVEN** the catalog size of "a" is 0 and the response has `Content-Length: 400`
- **WHEN** 100 bytes have arrived
- **THEN** the reported progress is 25

#### Scenario: cache.fetch.abort
- **GIVEN** a fetch of "a" is running
- **WHEN** its signal is aborted
- **THEN** the call rejects with an `AbortError` and nothing is stored

#### Scenario: cache.fetch.interrupted
- **GIVEN** the network drops halfway through downloading "a"
- **WHEN** the download fails
- **THEN** nothing is stored for "a" and the reader shows "Không tải được truyện" with "Thử lại"

#### Scenario: cache.fetch.not-found
- **GIVEN** the Worker answers 404 for the EPUB
- **THEN** the call rejects with `CacheError('not-found')` and nothing is stored

#### Scenario: cache.fetch.quota
- **GIVEN** storing the blob throws `QuotaExceededError`
- **THEN** the reader shows "Bộ nhớ đầy — hãy xoá bớt truyện đã lưu" with a link to Settings

#### Scenario: cache.fetch.offline
- **GIVEN** the device is offline and "a" is not cached
- **WHEN** `#/read/a` is opened directly
- **THEN** the reader shows "Cần kết nối mạng để tải truyện này lần đầu" and makes no request
