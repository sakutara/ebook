---
type: Data Store
title: bookFiles table
description: Cached EPUB blobs, one per book, kept until the user deletes them even if the book left Drive.
tags: [cache, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| bookId | string | primary key = books.id |
| blob | Blob | `application/epub+zip` |
| size | number | bytes |
| md5 | string | Drive md5 at download time |
| modifiedTime | number | Drive modifiedTime at download time |
| cachedAt | number | index |
| lastOpenedAt | number | index; Settings sorts by it |

Not synced (device-only, too big for JSON export). Replaced atomically: the new blob is
written only after a complete download; a failed refresh leaves the old row untouched.

# Indexes

`bookId, cachedAt, lastOpenedAt`

# Versions

- v2 (add-ebook-library-reader): table created
