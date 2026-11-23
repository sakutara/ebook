---
type: Data Store
title: storyRequests table
description: Story requests made on this device; local dedup and delivery state. Exported.
tags: [story-request, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T08:00:00Z }
---

# Schema (Dexie v3)

| field | type | notes |
|---|---|---|
| id | string | primary key (uuid) |
| key | string | **unique** index; see /knowledge/domain/story-request.md |
| title | string | normalised |
| author | string | normalised, may be '' |
| createdAt | number | index |
| sentAt | number \| null | set when the Form POST resolved |
| updatedAt | number | |
| deleted | 0 | always 0 (no delete UI) |

Each insert appends outbox op `storyRequest.submit` (payload: title, author, key) in the
same transaction. Included in JSON export/import.
