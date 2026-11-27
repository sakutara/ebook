## ADDED Requirements

### Requirement: Open a book in the reader
The route `#/read/<id>` SHALL obtain the book's blob from the book cache (fetching or refreshing it per the cache spec), open it in a `<foliate-view>` as a `File` named like the Drive file, update `bookFiles.lastOpenedAt`, and restore the saved position per the progress spec (start of text if none). Unknown ids SHALL show "Không tìm thấy truyện" with a link back.

#### Scenario: reader.open.cached
- **GIVEN** "a" is cached and current
- **WHEN** `#/read/a` opens
- **THEN** the first page of text is rendered without any network request

#### Scenario: reader.open.unknown
- **WHEN** `#/read/zzz` opens and no such book exists
- **THEN** "Không tìm thấy truyện" and a "Về thư viện" link are shown

#### Scenario: reader.open.offline
- **GIVEN** the device is offline and "a" is cached
- **WHEN** `#/read/a` opens
- **THEN** the book renders normally

### Requirement: Page navigation
The reader SHALL page with taps (left 30 % previous, right 30 % next, middle toggles the chrome), swipes, and on PC the ←/→, PageUp/PageDown and Space keys. The bottom bar SHALL show the current section title and `round(fraction × 100)%`; its slider SHALL jump with `goToFraction` on release.

#### Scenario: reader.nav.tap
- **WHEN** the user taps the right 30 % of the page
- **THEN** the next page is shown and the % does not decrease

#### Scenario: reader.nav.keys
- **WHEN** the user presses → on a 1280 px viewport
- **THEN** the next page is shown

#### Scenario: reader.nav.slider
- **WHEN** the user releases the slider at 50 %
- **THEN** the reader jumps to about 50 % of the book

#### Scenario: reader.chrome.toggle
- **WHEN** the user taps the middle of the page
- **THEN** the top and bottom bars appear, and a second tap hides them

### Requirement: Table of contents
The reader SHALL show the book's TOC; selecting an entry SHALL go to it and close the TOC on narrow viewports. On wide viewports the reader SHALL let the user hide and show the TOC side panel and SHALL remember that choice on the device.

#### Scenario: reader.toc.go
- **WHEN** the user opens the TOC and selects "Chương 5"
- **THEN** chapter 5 is shown

#### Scenario: reader.layout.narrow
- **WHEN** the viewport is 375 px wide
- **THEN** the TOC opens as a full-screen sheet and the app's bottom tab bar is hidden in the reader

#### Scenario: reader.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** the TOC is a side panel next to the text and the text column is at most 40 rem wide

#### Scenario: reader.toc.collapse
- **WHEN** the user closes the TOC side panel on a 1280 px viewport
- **THEN** the text area takes the full width at the same position, and the top bar button brings the panel back

#### Scenario: reader.toc.remember
- **GIVEN** the user hid the side panel
- **WHEN** a book is opened again
- **THEN** the panel stays hidden

### Requirement: Reading preferences
The reader SHALL offer font size 80–160 % in 10 % steps, line height 1.4 / 1.6 / 1.8 and theme Sáng / Sepia / Tối, apply them immediately, and persist them in `settings` key `reader.prefs` (defaults 100 %, 1.6, Sáng) so they apply to every book offline.

#### Scenario: reader.prefs.apply
- **WHEN** the user sets font size 120 % and theme Tối
- **THEN** the text is re-rendered at 120 % on a dark background without losing the current position

#### Scenario: reader.prefs.persist
- **GIVEN** the user chose 120 % and Tối
- **WHEN** another book is opened after an app restart offline
- **THEN** it opens at 120 % with theme Tối
