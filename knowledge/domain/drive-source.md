---
type: Domain Concept
title: Drive source
description: The one public Google Drive folder the catalog is read from, and how the app talks to Drive without a backend.
tags: [catalog, drive]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
sources:
  - id: drive-list
    resource: https://developers.google.com/drive/api/reference/rest/v3/files/list
---

# What it is

A Google Drive folder shared as "Anyone with the link — Viewer". Its id
(`VITE_GD_FOLDER_ID`) and a browser API key restricted to Drive API and to the app's
HTTP referrers (`VITE_GD_API_KEY`) are baked into the build (both are public by nature).

# Calls the app makes (all GET, all CORS-enabled, no OAuth)

| purpose | request |
|---|---|
| list books | `https://www.googleapis.com/drive/v3/files?q='<folder>' in parents and trashed = false&fields=nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType)&pageSize=200&orderBy=name&key=<key>` (+ `pageToken`) |
| read a book into the cache | `https://www.googleapis.com/drive/v3/files/<id>?alt=media&key=<key>` |
| read part of a book (cover extraction) | same URL with header `Range: bytes=a-b` |
| user "Tải" (download) | plain link `https://drive.google.com/uc?export=download&id=<id>` (browser handles it, not fetch) |

Only files whose name ends in `.epub` (case-insensitive) are books; anything else in the
folder is ignored.

# Failure meanings

- 400/403 with `keyInvalid`/`API_KEY_HTTP_REFERRER_BLOCKED`/`accessNotConfigured` → config problem, shown as "Cấu hình Google Drive không hợp lệ".
- 404 on the folder → folder not public or wrong id.
- 403 `userRateLimitExceeded`/429 → retry with backoff, keep the last catalog.
- Network error → offline; the local catalog is used as-is.

Spec: /openspec/specs/catalog/spec.md
