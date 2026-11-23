---
type: Data Store
title: books table
description: The local catalog — one row per .epub seen in the Drive folder, kept while it has a cached file or reading position.
tags: [catalog, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string | primary key = Drive file id |
| name | string | Drive file name, e.g. `Ten truyen.epub` |
| title | string | display title (see [Book](/domain/book.md)) |
| normTitle | string | index; search + re-attachment key |
| size | number | bytes (Drive returns a string; parse) |
| modifiedTime | number | epoch ms (parse Drive RFC 3339) |
| md5 | string | Drive `md5Checksum` |
| inDrive | 0 \| 1 | index; 0 = gone from Drive but kept (local-only) |
| lastSeenAt | number | epoch ms of the catalog sync that last listed it |
| updatedAt | number | epoch ms |

Not synced through the outbox: Drive is the source of truth; this is a cache of it.

# Indexes

`id, normTitle, inDrive, lastSeenAt`

# Versions

- v2 (add-ebook-library-reader): table created

# Examples

{ "id": "1AbC…", "name": "Đấu Phá Thương Khung.epub", "title": "Đấu Phá Thương Khung", "normTitle": "dau pha thuong khung", "size": 2483021, "modifiedTime": 1763800000000, "md5": "9e1c…", "inDrive": 1, "lastSeenAt": 1763892000000, "updatedAt": 1763892000000 }
