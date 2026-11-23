---
type: Data Store
title: covers table
description: Downscaled cover thumbnails extracted from each EPUB, or a marker that the book has none.
tags: [library, cache, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| bookId | string | primary key |
| blob | Blob \| null | WebP (JPEG fallback), max 320 px wide; null = book has no cover → placeholder |
| md5 | string | book version the cover came from; a different md5 triggers re-extraction |
| fetchedAt | number | epoch ms |

Device-only, not exported. Deleted together with the book's catalog row; kept for
local-only books. "Xoá toàn bộ cache" does not delete covers (they are small); a separate
total is shown.

# Indexes

`bookId`

# Versions

- v2 (add-ebook-library-reader): table created
