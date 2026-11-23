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
| id | string | primary key = R2 slug (Drive file id for pre-v4 rows) |
| name | string | Drive file name, e.g. `Ten truyen.epub` |
| title | string | display title (see [Book](/domain/book.md)) |
| normTitle | string | index; search + re-attachment key |
| author | string | from metadata.json; `""` when unknown (v4) |
| normAuthor | string | `normalize(author)`; search + author filter (v4) |
| genres | string[] | display names, see [Genre](/domain/genre.md) (v4) |
| description | string | from metadata.json (v4) |
| size | number | bytes (Drive returns a string; parse) |
| modifiedTime | number | epoch ms (parse Drive RFC 3339) |
| md5 | string | Drive `md5Checksum` |
| inDrive | 0 \| 1 | index; 1 = listed in the R2 catalog; 0 = gone but kept (local-only). Name kept from the Drive era |
| lastSeenAt | number | epoch ms of the catalog sync that last listed it |
| updatedAt | number | epoch ms |

Not synced through the outbox: Drive is the source of truth; this is a cache of it.

# Indexes

`id, normTitle, inDrive, lastSeenAt`

# Versions

- v2 (add-ebook-library-reader): table created
- v4 (move-books-to-r2): author, normAuthor, genres, description added; rows default to empty

# Examples

{ "id": "1AbC…", "name": "Đấu Phá Thương Khung.epub", "title": "Đấu Phá Thương Khung", "normTitle": "dau pha thuong khung", "size": 2483021, "modifiedTime": 1763800000000, "md5": "9e1c…", "inDrive": 1, "lastSeenAt": 1763892000000, "updatedAt": 1763892000000 }
