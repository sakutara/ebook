## ADDED Requirements

### Requirement: Local-only deployer page
The deployer SHALL be served by `npm run deployer` on port 5174 from `deployer/index.html` and SHALL NOT be part of `npm run build` output.

#### Scenario: deployer.build.excluded
- **WHEN** `npm run build` runs
- **THEN** `dist/` contains no deployer HTML or deployer bundle

### Requirement: Connect to the Worker
The deployer SHALL ask for the Worker URL (pre-filled from `VITE_R2_BASE_URL`) and the admin token, check them with `GET /admin/list?prefix=books/&limit=1`, and keep the token in `localStorage` only when "Nhớ trên máy này" is ticked (otherwise in memory only).

#### Scenario: deployer.connect.ok
- **WHEN** a valid URL and token are entered and "Kết nối" is pressed
- **THEN** the page shows "Đã kết nối" and the current number of books from `catalog.json`

#### Scenario: deployer.connect.bad-token
- **WHEN** the Worker answers 401
- **THEN** the page shows "Sai mã quản trị" and upload stays disabled

#### Scenario: deployer.connect.forget
- **GIVEN** "Nhớ trên máy này" is not ticked
- **WHEN** the page is reloaded
- **THEN** the token field is empty

### Requirement: Pick many EPUB files
The deployer SHALL accept many files at once from a file input (`multiple`, `accept=".epub"`) or by drag-and-drop, ignore non-`.epub` files with a notice, and process at most 2 files at a time.

#### Scenario: deployer.pick.many
- **WHEN** the owner drops 12 `.epub` files and 1 `.pdf`
- **THEN** 12 book cards appear and the notice "Bỏ qua 1 tệp không phải EPUB" is shown

### Requirement: Extract metadata and cover from the EPUB
For each EPUB the deployer SHALL read the OPF metadata and build a draft: `title` = first `dc:title` (trimmed; file name without extension when missing), `author` = all `dc:creator` joined with ", ", `genres` = `genresFromSubjects(dc:subject…)`, `description` = `dc:description` with tags stripped, ≤ 1000 chars, `language` = `dc:language` or `vi`, `size` and hex `md5` of the bytes. A file that is not a readable EPUB SHALL get status "Lỗi" with the reason and SHALL NOT be uploaded.

#### Scenario: deployer.extract.metadata
- **GIVEN** an EPUB with title "Phàm Nhân Tu Tiên", creators "Vong Ngữ", subjects "Tiên Hiệp", "xianxia"
- **WHEN** it is processed
- **THEN** the draft has title "Phàm Nhân Tu Tiên", author "Vong Ngữ", genres ["Tiên hiệp"], slug "pham-nhan-tu-tien"

#### Scenario: deployer.extract.broken
- **GIVEN** a `.epub` file that is not a zip
- **WHEN** it is processed
- **THEN** its card shows "Lỗi: không đọc được EPUB" and it is excluded from upload

### Requirement: Produce cover.jpg
The deployer SHALL convert the EPUB cover to JPEG (quality 0.85, width ≤ 600 px, aspect kept, white background under transparency). When the EPUB has no cover it SHALL draw a 600×900 JPEG with the title and author on a colour from `placeholderHue(normTitle)`.

#### Scenario: deployer.cover.resize
- **GIVEN** a 1200×1800 PNG cover
- **THEN** `cover.jpg` is 600×900 JPEG

#### Scenario: deployer.cover.generated
- **GIVEN** an EPUB without a cover
- **THEN** a generated 600×900 `cover.jpg` showing the title is used and the card marks it "Bìa tự tạo"

### Requirement: Review and edit before upload
Each book card SHALL show the cover preview and editable title, author, genres (known-genre toggles plus a free-text field) and slug (auto from title until edited; must satisfy `isSlug`). Status SHALL be "Mới" (slug absent from `catalog.json`), "Cập nhật" (present, md5 differs) or "Đã có" (same md5; unticked by default).

#### Scenario: deployer.review.edit
- **WHEN** the owner changes the title of a draft whose slug was not edited
- **THEN** the slug follows the new title and the status is recomputed

### Requirement: Slug collisions
A slug used in the catalog by a book with a different `normTitle`, or by another draft in the batch, SHALL be replaced by the first free `-2`, `-3`, … suffix.

#### Scenario: deployer.review.status
- **GIVEN** the catalog has "dau-pha" with md5 "m1"
- **WHEN** drafts with slug "dau-pha" and md5 "m1", and slug "dau-pha" titled differently, are reviewed
- **THEN** the first is "Đã có" and unticked, the second is suggested slug "dau-pha-2" and is "Mới"

#### Scenario: deployer.review.invalid-slug
- **WHEN** the owner types "Đấu Phá" as slug
- **THEN** the field shows "Chỉ dùng a-z, 0-9 và dấu -" and upload of that book is blocked

### Requirement: Upload the three files per book
On "Tải lên" the deployer SHALL upload ticked, valid books one at a time: `PUT /admin/books/<slug>/<slug>.epub`, then `cover.jpg`, then `metadata.json` (schema in /knowledge/domain/r2-source.md, `updatedAt` = now), showing a progress bar per book (bytes sent / total of its 3 files, via XHR upload progress) and an overall bar (books done / books ticked). A failed book SHALL be marked "Lỗi" with a "Thử lại" button while the rest continue. "Dừng" SHALL stop after the current book.

#### Scenario: deployer.upload.layout
- **WHEN** "Phàm Nhân Tu Tiên" is uploaded
- **THEN** exactly `books/pham-nhan-tu-tien/pham-nhan-tu-tien.epub`, `books/pham-nhan-tu-tien/cover.jpg` and `books/pham-nhan-tu-tien/metadata.json` are written, in that order

#### Scenario: deployer.upload.progress
- **WHEN** half of a book's bytes are sent
- **THEN** its progress bar shows 50 % and the overall bar shows the books finished so far

#### Scenario: deployer.upload.partial-failure
- **GIVEN** 3 books are ticked and the second book's EPUB PUT fails
- **THEN** books 1 and 3 are uploaded, book 2 shows "Lỗi" and "Thử lại", and the catalog has books 1 and 3

#### Scenario: deployer.upload.offline
- **GIVEN** the computer is offline
- **WHEN** "Tải lên" is pressed
- **THEN** nothing is sent and "Cần kết nối mạng để tải lên" is shown

### Requirement: Keep catalog.json in step
After each book's three files succeed, the deployer SHALL `GET catalog.json` (no-cache, read `ETag`; 404 = empty), replace or add the entry with that id, sort `books` by id, set `generatedAt`, and `PUT /admin/catalog.json` with `If-Match` (no header when it did not exist); on 412 it SHALL retry the read-merge-write up to 5 times.

#### Scenario: deployer.catalog.merge
- **GIVEN** the catalog lists "a" and "c"
- **WHEN** "b" is uploaded
- **THEN** the catalog lists "a", "b", "c"

#### Scenario: deployer.catalog.conflict
- **GIVEN** the first catalog PUT answers 412
- **THEN** the deployer re-reads the catalog, merges again and the second PUT succeeds

### Requirement: Manage published books
A "Đã đăng" tab SHALL list catalog books (cover, title, author, genres, size) with search, offer "Xoá" per book (confirm dialog; deletes the 3 objects then removes the entry with the same merge rule) and "Dựng lại catalog" (lists `books/` via `GET /admin/list` with paging, reads every `metadata.json`, writes a new `catalog.json`; shows progress).

#### Scenario: deployer.manage.delete
- **WHEN** the owner deletes "b" and confirms
- **THEN** the 3 objects of "b" are deleted and the catalog no longer lists "b"

#### Scenario: deployer.manage.rebuild
- **GIVEN** the bucket has 3 book folders with metadata.json and catalog.json lists only 2
- **WHEN** "Dựng lại catalog" finishes
- **THEN** catalog.json lists the 3 books

### Requirement: Deployer layout
The deployer SHALL be usable from 360 px (cards stacked) to desktop (≥ 1024 px: two-column card grid, settings in a side column).

#### Scenario: deployer.layout.narrow
- **WHEN** the viewport is 375 px wide
- **THEN** book cards are stacked one per row and there is no horizontal scroll

#### Scenario: deployer.layout.wide
- **WHEN** the viewport is 1280 px wide
- **THEN** book cards are in two columns and the connection panel is beside them
