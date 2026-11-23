# Move the book source from Google Drive to Cloudflare R2 + Worker

## Why
Reading straight from a public Drive folder runs into Drive's download throttling, risks the
whole folder being unshared, and gives the library no covers until a book is downloaded.
The owner chose Cloudflare R2 behind a Worker
([0008](/knowledge/decisions/0008-r2-worker-book-source.md)). Vocabulary:
[R2 source](/knowledge/domain/r2-source.md), [Genre](/knowledge/domain/genre.md),
[Book](/knowledge/domain/book.md).

## What changes
- **Worker** (new, `worker/`): public read-only gateway to the bucket (CORS, Range, ETag,
  edge cache, `?download=1`) plus a token-guarded admin API used by the deployer
  (change `add-r2-deployer`).
- **Catalog**: one `GET catalog.json` replaces the paged Drive listing. Books carry
  `author`, `genres`, `description`. Ids become slugs; on the first R2 sync, cached files and
  positions of old Drive-id books move to the new slug by md5, positions also by title.
- **Covers**: the library shows `cover.jpg` straight from R2 for every book, before
  anything is downloaded. Covers are cached by the service worker for offline use. EPUB
  cover extraction, Range reads and the `covers` table are removed.
- **Download progress**: while an EPUB is fetched (Đọc or Tải), the card shows a progress
  bar with percent; the reader's loading screen shows the same bar.
- **Grid only**: the list layout and its toggle are removed.
- **Filters**: by genre (Tiên hiệp, Huyền huyễn, Khoa huyễn, + others found) and by author;
  they combine with search and "Đã lưu". Search also matches the author.
- **Config**: `VITE_R2_BASE_URL` replaces `VITE_GD_API_KEY` / `VITE_GD_FOLDER_ID`.

## Impact
- Capabilities: worker (ADDED), catalog (MODIFIED), library (MODIFIED), cache (MODIFIED),
  reader (MODIFIED), app-shell (MODIFIED)
- Data: Dexie v4 — `books` gains `author`, `normAuthor`, `genres`, `description`; `covers`
  table dropped; one-time migration of Drive-id rows (design.md §Data).
- Code removed: `src/drive/**`, `src/covers/**`, list layout in `library-state.ts` / `BookCard.tsx`.
- Offline: library, filters and search are fully offline from the local catalog; covers
  offline once seen (service-worker cache); reading needs the network only the first time.
- Out of scope: the deployer page itself (change `add-r2-deployer`), multi-select genre
  filter, author pages, sorting other than by title, Drive as a fallback source, deleting
  books from the app, any reader data on the server.
