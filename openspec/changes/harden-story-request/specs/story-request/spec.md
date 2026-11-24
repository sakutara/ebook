## MODIFIED Requirements

### Requirement: De-duplication
A request SHALL be refused when its key (`normalize(title)`, accent/case/punctuation-insensitive; author is not part of it) already exists on this device, or when `normalize(title)` equals a catalog book's `normTitle`.

#### Scenario: story-request.dedup.device
- **GIVEN** `Phàm Nhân Tu Tiên` by `Vong Ngữ` was requested earlier
- **WHEN** the user submits `pham nhan tu tien!` by `VONG NGU`
- **THEN** "Bạn đã yêu cầu truyện này" is shown, no row or outbox op is added

#### Scenario: story-request.dedup.library
- **GIVEN** the catalog has a book titled `Đấu Phá Thương Khung`
- **WHEN** the user submits `dau pha thuong khung`
- **THEN** "Truyện đã có trong thư viện" is shown with a link to `#/` searching that title, and nothing is saved

#### Scenario: story-request.dedup.title-unique
- **GIVEN** `Tam Quốc` by `La Quán Trung` was requested
- **WHEN** the user submits `tam quoc` with no author, or with author `Khác`
- **THEN** "Bạn đã yêu cầu truyện này" is shown and nothing is saved

#### Scenario: story-request.dedup.migrate
- **GIVEN** a v4 database with rows `Tam Quốc|La Quán Trung` (older) and `Tam Quốc|` (newer, with a queued `storyRequest.submit` op)
- **WHEN** the app opens at v5
- **THEN** only the older row remains, its key is `tam quoc`, and the newer row's outbox op is removed

#### Scenario: story-request.dedup.import-old-backup
- **GIVEN** a backup whose `storyRequests` rows use the old `title|author` key
- **WHEN** it is imported
- **THEN** each row is stored with key `normalize(title)`, and a row whose title already exists on the device is skipped

## ADDED Requirements

### Requirement: Submit throttle
The app SHALL refuse a new request when the newest row in `storyRequests` was created less than 10 000 ms ago, showing "Vui lòng đợi N giây rồi gửi tiếp" where N is the remaining whole seconds rounded up. Nothing SHALL be written. The check SHALL run before the duplicate check and again inside the save transaction.

#### Scenario: story-request.throttle.too-soon
- **GIVEN** a request was saved 3 000 ms ago
- **WHEN** the user submits a different, valid title
- **THEN** "Vui lòng đợi 7 giây rồi gửi tiếp" is shown and no row or outbox op is added

#### Scenario: story-request.throttle.after-window
- **GIVEN** a request was saved 10 000 ms ago
- **WHEN** the user submits a different, valid title
- **THEN** it is saved

#### Scenario: story-request.throttle.offline
- **GIVEN** the device is offline and a request was saved 2 000 ms ago
- **WHEN** the user submits another title
- **THEN** it is refused the same way (the throttle is local)

### Requirement: Honeypot field
The form SHALL contain a text input named `website`, hidden from sight and from assistive technology (`aria-hidden`, `tabindex=-1`, `autocomplete=off`, positioned off-screen). When it is non-empty on submit, the app SHALL show the success toast "Đã gửi yêu cầu", clear the form, and write nothing.

#### Scenario: story-request.honeypot.filled
- **GIVEN** the `website` field contains `http://spam.example`
- **WHEN** the form is submitted with a valid title
- **THEN** "Đã gửi yêu cầu" is shown, no row or outbox op is added, and no POST is made

#### Scenario: story-request.honeypot.hidden
- **WHEN** a user tabs through the form at narrow (360px) and wide (1280px) widths
- **THEN** focus never lands on the `website` field and it has no visible box

### Requirement: Sheet de-duplication
The repository SHALL ship an Apps Script for the response Sheet. Its `onFormSubmit(e)` SHALL delete the submitted row when the normalised title (same rules as `normalize`: NFD, strip marks, đ→d, lowercase, non-alphanumerics → single space, trim) equals that of any earlier row; `dedupeAll()` SHALL delete every later duplicate, keeping the first; rows with an empty title SHALL be deleted. The script SHALL locate the title column by header text configured in one constant.

#### Scenario: story-request.sheet.dedupe-new
- **GIVEN** the Sheet has `Phàm Nhân Tu Tiên` in row 2
- **WHEN** a submission with title `pham nhan tu tien!` lands in row 5
- **THEN** row 5 is deleted and row 2 is kept

#### Scenario: story-request.sheet.dedupe-all
- **GIVEN** titles `A`, `B`, `a`, ``, `b!`, `C` in rows 2–7
- **WHEN** `dedupeAll()` runs
- **THEN** rows `A`, `B`, `C` remain in that order
