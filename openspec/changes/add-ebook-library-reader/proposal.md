# Add EPUB library and reader backed by a public Google Drive folder

## Why
The owner keeps Vietnamese novels as `.epub` files in one public Google Drive folder and
wants to browse, download and read them on a phone — offline on the commute — and always
continue where they stopped. Vocabulary: [Book](/knowledge/domain/book.md),
[Drive source](/knowledge/domain/drive-source.md),
[Reading position](/knowledge/domain/reading-position.md).

## What changes
- **Catalog**: mirror the Drive folder listing (`.epub` only) into IndexedDB on start, on
  reconnect, on app focus and on demand; keep books that left Drive while they are cached.
- **Library**: cover grid with title, incremental (lazy) rendering, lazy cover extraction,
  instant diacritic-insensitive search, filter "Đã lưu", badges, progress %.
- **Download ("Tải")**: saves the EPUB — from the device cache when present, otherwise via
  the direct Google Drive download link.
- **Read ("Đọc")**: opens a full-screen paginated reader (foliate-js) on the cached copy,
  downloading it first if needed.
- **Book cache**: cached EPUBs persist until the user deletes them (per book or all), even
  after the book is removed from Drive; stale copies auto-refresh when Drive is newer.
- **Resume**: a layered position anchor (CFI + text snippet + section/fraction + book
  fraction) restores the exact place, also after a cache refresh to a changed file, after
  cache deletion, and after a delete-and-reupload on Drive with the same title.
- **Settings**: storage usage, cached books list, clear cache, clear reading positions,
  export/import positions and preferences, Drive sync status.
- **Icon-first actions**: CTA buttons are icon-only, using a custom icon set drawn by Claude for each button (`src/ui/icons/svg/`), with Vietnamese labels as `aria-label` + tooltip; nav, filter and confirm dialogs keep text. See /knowledge/ui/icons.md.
- Hosting on https://ebook.fiddle.vn/ (base `/`, CNAME).

## Impact
- Capabilities: catalog, library, cache, reader, progress, app-shell (all ADDED);
  sync unchanged (progress writes use the existing outbox).
- Data: Dexie schema v1 → v2 adds `books`, `bookFiles`, `covers`, `progress`
  (see /knowledge/data/). Backup export skips `books`, `bookFiles`, `covers`.
- New dependency: `foliate-js@1.0.1` (MIT). Config: `VITE_GD_API_KEY`, `VITE_GD_FOLDER_ID`
  in `.env.local`.
- Offline: library, search, reading cached books, resume, cache management, download of
  cached books all work offline. Needs network: catalog refresh, first download of a book,
  cover extraction for uncached books, stale refresh, downloading uncached books.
- Out of scope: MOBI/PRC/PDF and other formats; sub-folders or several Drive folders;
  OAuth / private folders; cross-device progress sync (adapter stays local-only); third-party icon libraries or icon fonts;
  bookmarks, highlights, notes; full-text search across books; text-to-speech; sorting other
  than by title; editing metadata; Drive `thumbnailLink` covers.
