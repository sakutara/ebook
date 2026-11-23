## ADDED Requirements

### Requirement: Request form
Route `#/request` SHALL show a form with "Tên truyện" (required, ≤ 200 chars) and "Tác giả" (optional, ≤ 100 chars), a submit button (icon `send` + text "Gửi yêu cầu"), and a live preview "Sẽ gửi: <title> — <author>" of the normalised values.

#### Scenario: story-request.form.required
- **WHEN** the title is empty or only whitespace/punctuation and the user submits
- **THEN** "Nhập tên truyện" is shown and nothing is saved

#### Scenario: story-request.layout.narrow
- **WHEN** `#/request` is shown at 375 px
- **THEN** fields are full width, stacked, with no horizontal scroll

#### Scenario: story-request.layout.wide
- **WHEN** `#/request` is shown at 1280 px
- **THEN** the form is at most 40rem wide and the "Đã yêu cầu" list sits beside it

### Requirement: Normalisation
Title and author SHALL be stored and sent as NFC Vietnamese Title Case: control/zero-width characters removed, whitespace collapsed, wrapping quotes/brackets and trailing punctuation removed, each word (split on spaces and hyphens) with its first letter upper-cased with Vietnamese locale and the rest lower-cased, Roman numerals II–XX (except VI, which is also a Vietnamese word) kept upper-case.

#### Scenario: story-request.normalize.title-case
- **WHEN** the title is `  phàm   nhân TU TIÊN truyện ` and the author `vong ngữ`
- **THEN** the stored values are `Phàm Nhân Tu Tiên Truyện` and `Vong Ngữ`

#### Scenario: story-request.normalize.nfc
- **WHEN** the title is typed with decomposed marks (`đào`)
- **THEN** it is stored as the precomposed `Đào`

#### Scenario: story-request.normalize.punctuation
- **WHEN** the title is `"đấu phá thương khung"!!` or `đấu phá - thương khung ii`
- **THEN** it is stored as `Đấu Phá Thương Khung` and `Đấu Phá - Thương Khung II` respectively

#### Scenario: story-request.normalize.no-accent-warning
- **WHEN** the title contains letters but none outside ASCII (e.g. `pham nhan tu tien`)
- **THEN** the form shows "Tên truyện chưa có dấu — hãy gõ tiếng Việt có dấu" and the first submit only asks to confirm; a second submit sends it

### Requirement: De-duplication
A request SHALL be refused when its key (`normalize(title)|normalize(author)`, accent/case/punctuation-insensitive) already exists on this device, or when `normalize(title)` equals a catalog book's `normTitle`.

#### Scenario: story-request.dedup.device
- **GIVEN** `Phàm Nhân Tu Tiên` by `Vong Ngữ` was requested earlier
- **WHEN** the user submits `pham nhan tu tien!` by `VONG NGU`
- **THEN** "Bạn đã yêu cầu truyện này" is shown, no row or outbox op is added

#### Scenario: story-request.dedup.library
- **GIVEN** the catalog has a book titled `Đấu Phá Thương Khung`
- **WHEN** the user submits `dau pha thuong khung`
- **THEN** "Truyện đã có trong thư viện" is shown with a link to `#/` searching that title, and nothing is saved

#### Scenario: story-request.dedup.author-differs
- **GIVEN** `Tam Quốc` by `La Quán Trung` was requested
- **WHEN** the user submits `Tam Quốc` with no author
- **THEN** it is accepted as a new request

### Requirement: Delivery to Google Form
An accepted request SHALL be written to `storyRequests` and an outbox op `storyRequest.submit` in one transaction; the sync adapter SHALL POST it to `https://docs.google.com/forms/d/e/<VITE_REQUEST_FORM_ID>/formResponse` (no-cors, urlencoded, `entry.<id>` for title, author and, when configured, key) and mark the row `sentAt` when the fetch resolves. When the Form config is missing, the route SHALL show "Chưa cấu hình Google Form" and disable submit.

#### Scenario: story-request.submit.online
- **GIVEN** online and the Form configured with entry IDs 111/222/333
- **WHEN** the user submits `phàm nhân tu tiên` / `vong ngữ`
- **THEN** one POST is sent with body `entry.111=Phàm Nhân Tu Tiên&entry.222=Vong Ngữ&entry.333=pham nhan tu tien|vong ngu` (URL-encoded), the row gets `sentAt`, the outbox is empty, and a toast "Đã gửi yêu cầu" shows

#### Scenario: story-request.submit.offline
- **GIVEN** the browser is offline
- **WHEN** the user submits a valid request
- **THEN** the row is saved, the outbox holds one op, the toast reads "Đã lưu, sẽ gửi khi có mạng" and the list shows it as "Chờ gửi"

#### Scenario: story-request.submit.resync
- **GIVEN** one queued request from offline
- **WHEN** the browser goes online
- **THEN** the POST is sent once, the row gets `sentAt`, and the list shows "Đã gửi"

#### Scenario: story-request.submit.network-error
- **WHEN** the POST rejects
- **THEN** the op stays in the outbox with `attempts` incremented and is retried with backoff

#### Scenario: story-request.config.missing
- **GIVEN** `VITE_REQUEST_FORM_ID` or the title entry ID is empty
- **WHEN** `#/request` opens
- **THEN** the notice is shown and submit is disabled

### Requirement: Request history and backup
The page SHALL list this device's requests newest first with title, author and state ("Đã gửi" / "Chờ gửi"); `storyRequests` SHALL be included in JSON export/import.

#### Scenario: story-request.backup.roundtrip
- **GIVEN** two requests
- **WHEN** data is exported and imported into an empty DB
- **THEN** both rows exist and a re-submit of either is refused as duplicate
