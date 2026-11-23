## MODIFIED Requirements

### Requirement: Open a book in the reader
The route `#/read/<id>` SHALL obtain the book's blob from the book cache (fetching or refreshing it per the cache spec), showing while it loads the same progress bar as the library card (`role="progressbar"`, `aria-label="Đang tải truyện"`, percent text or indeterminate), open it in a `<foliate-view>` as a `File` named after the book's `epub` file name, update `bookFiles.lastOpenedAt`, and restore the saved position per the progress spec (start of text if none). Unknown ids SHALL show "Không tìm thấy truyện" with a link back.

#### Scenario: reader.open.cached
- **GIVEN** "a" is cached and current
- **WHEN** `#/read/a` opens
- **THEN** the first page of text is rendered without any network request

#### Scenario: reader.open.progress
- **GIVEN** "d" is not cached, online
- **WHEN** `#/read/d` opens and 40 % of the bytes have arrived
- **THEN** a progressbar named "Đang tải truyện" with `aria-valuenow=40` is visible

#### Scenario: reader.open.unknown
- **WHEN** `#/read/zzz` opens and no such book exists
- **THEN** "Không tìm thấy truyện" and a "Về thư viện" link are shown

#### Scenario: reader.open.offline
- **GIVEN** the device is offline and "a" is cached
- **WHEN** `#/read/a` opens
- **THEN** the book renders normally
