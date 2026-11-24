---
type: Data Store
title: storyRequests table
description: Story requests made on this device; local dedup and delivery state. Exported.
tags: [story-request, dexie]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T08:00:00Z }
---

# Schema (Dexie v3; key re-computed in v5)

| field | type | notes |
|---|---|---|
| id | string | primary key (uuid) |
| key | string | **unique** index, `normalize(title)`; see /knowledge/domain/story-request.md |
| title | string | normalised |
| author | string | normalised, may be '' (optional in the form) |
| originalTitle | string \| undefined | normalised, may be ''. Added later; rows saved before it are undefined (no schema bump, not indexed) |
| language | string \| undefined | normalised, may be ''. Same as originalTitle |
| createdAt | number | index |
| sentAt | number \| null | set when the Form POST resolved |
| updatedAt | number | |
| deleted | 0 | always 0; unused. Deletion is a hard delete (see below) |

Each insert appends outbox op `storyRequest.submit` (payload: title, author, originalTitle,
language, key) in the same transaction. Included in JSON export/import.

**Delete (local only):** `deleteSentRequest` removes a row from this device only, and only when
`sentAt` is set. It queues no outbox op and does not touch the Google Form. Once removed, the same
title can be requested again and will be sent again.

**Failed send:** when the POST rejects (network error), the sync engine keeps the op with
`lastError` set and retries it in the background. `listFailedRequestIds` returns the request ids
whose op has `lastError`. The list shows "Gửi thất bại" and a "Gửi lại" button for those rows only.
"Gửi lại" calls the sync engine's `flush`; once the op is acked, the row is marked sent and the
button disappears. A request that is only queued (offline, never attempted) is "Chờ gửi", not failed.
Limitation: the POST uses `mode: 'no-cors'`, so the app cannot see HTTP errors (wrong entry ids,
closed form). Those count as sent.

**v5 migration:** re-keys every row to `normalize(title)` (old keys were `title|author`). Rows
walked oldest first; a row whose new key was already seen is deleted with its queued
`storyRequest.submit` op, and kept ops get the new `payload.key`. Backup import re-keys
`storyRequests` rows before the unique-index guard, so an old backup cannot bring a duplicate title back.
