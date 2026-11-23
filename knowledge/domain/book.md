---
type: Domain Concept
title: Book
description: One .epub file in the Drive folder, identified by its Drive file id, with an optional cached copy and cover on the device.
tags: [catalog, library, cache]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Identity

- **id** = Drive file id. Stable while the owner *updates* the file in place (Drive "Manage
  versions" or overwrite from Drive for Desktop).
- **normTitle** = normalised title (see below). Used to re-attach reading position when the
  owner deletes a file and uploads a new one with the same name (new id).

# Title

`title` = file name without the `.epub` extension, with `_` replaced by spaces and runs of
whitespace collapsed. `normTitle` = `title` → NFD → strip combining marks (\p{M}) → `đ/Đ`
→ `d` → lowercase → every non-alphanumeric run → one space → trim. Example:
`"Đấu_Phá Thương Khung (Full).epub"` → title `"Đấu Phá Thương Khung (Full)"`, normTitle
`"dau pha thuong khung full"`. Search uses the same normaliser on the query.

# Version

A book's version is its Drive `md5Checksum` (+ `modifiedTime`). The cached copy records
the version it was downloaded at. **Stale** = the Drive version differs from the cached one
**and** Drive's `modifiedTime` is newer than the cached one.

# States a book can be in (shown as badges)

| state | meaning | badge |
|---|---|---|
| remote | in Drive, not cached | — |
| cached | cached copy is the current Drive version | "Đã lưu" |
| stale | cached, Drive has a newer version | "Có bản mới" (auto-refreshes when online) |
| local-only | gone from Drive, cached copy still on device | "Chỉ còn trên máy" |

A book gone from Drive with no cached copy disappears from the library (its reading
position is kept, see [Reading position](/domain/reading-position.md)).

Data: [books](/data/books.md), [bookFiles](/data/book-files.md), [covers](/data/covers.md).
