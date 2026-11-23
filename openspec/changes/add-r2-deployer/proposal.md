# Add the R2 deployer page

## Why
After [0008](/knowledge/decisions/0008-r2-worker-book-source.md) the library reads books from
R2, so the owner needs a way to publish EPUBs there: pick many files on the computer, have
cover and metadata extracted, review them, and upload them straight to R2 in the layout of
[R2 source](/knowledge/domain/r2-source.md). Genres follow [Genre](/knowledge/domain/genre.md).

## What changes
- A separate local page in this repo (`npm run deployer`, http://localhost:5174), never built
  into the public `dist/`.
- **Connect**: Worker URL + admin token (token kept only when "Nhớ trên máy này" is ticked).
- **Pick**: many `.epub` files at once (file picker or drag-and-drop).
- **Process in the browser**: for each EPUB read `dc:title`, `dc:creator`, `dc:subject`,
  `dc:description`, `dc:language` and the cover; compute MD5 and size; make `cover.jpg`
  (≤ 600 px wide, JPEG 0.85, or a generated title cover when the EPUB has none); build
  `metadata.json`; derive the slug folder name from the title.
- **Review**: per book card with cover preview and editable title, author, genres, slug, and a
  status (Mới / Cập nhật / Đã có / Lỗi).
- **Upload**: per book `books/<slug>/<slug>.epub`, `cover.jpg`, `metadata.json` through the
  Worker admin API with per-file and overall progress bars, then merge the entry into
  `catalog.json` with `If-Match`.
- **Manage**: list published books, delete a book (3 objects + catalog entry), rebuild
  `catalog.json` from all `metadata.json`.

## Impact
- Capabilities: deployer (ADDED)
- Code: `deployer/**`, `vite.deployer.config.ts`, shared `src/domain/{slug,genre,title}.ts`.
- New dependency: `spark-md5` (deployer only; Web Crypto has no MD5).
- Offline: picking and processing work offline; upload, delete and rebuild need the network
  and say so. The deployer is not a PWA and stores no books.
- Depends on change `move-books-to-r2` (Worker admin API, shared domain helpers).
- Out of scope: editing an already-published book's metadata without re-uploading the EPUB,
  bulk import from Google Drive, image editing of covers, multi-user accounts, deploying the
  deployer publicly.
