---
type: Data Store
title: progress table
description: One layered reading-position anchor per book; survives cache deletion and refresh.
tags: [reader, progress, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Schema

| field | type | notes |
|---|---|---|
| id | string | primary key = bookId (one position per book) |
| bookId | string | index |
| normTitle | string | index; re-attachment |
| cfi | string | EPUB CFI |
| snippet | string | ≤ 120 chars |
| sectionIndex | number | |
| sectionHref | string | spine item id/href |
| sectionFraction | number | 0..1 |
| fraction | number | 0..1 of whole book; shown as % on the card |
| bookMd5 | string | version the anchor was taken on |
| updatedAt | number | index; last-write-wins |
| deleted | 0 \| 1 | soft delete |

Synced record: every write appends an outbox op (`progress.upsert` / `progress.delete`)
in the same transaction. Included in JSON export/import.

# Indexes

`id, bookId, normTitle, updatedAt`

# Versions

- v2 (add-ebook-library-reader): table created

# Examples

{ "id": "1AbC…", "bookId": "1AbC…", "normTitle": "dau pha thuong khung", "cfi": "epubcfi(/6/14!/4/2/10,/1:0,/1:58)", "snippet": "Tiêu Viêm nhìn lên bầu trời…", "sectionIndex": 6, "sectionHref": "chap005.xhtml", "sectionFraction": 0.42, "fraction": 0.031, "bookMd5": "9e1c…", "updatedAt": 1763892000000, "deleted": 0 }
