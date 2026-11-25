---
type: Domain Concept
title: R2 source
description: Bucket layout, metadata.json and catalog.json schemas, slug rule and the Worker HTTP API the app and the deployer use.
tags: [catalog, r2, worker, deployer]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-23T09:00:00Z }
---

# Bucket layout

```
catalog.json                      # aggregate index, rewritten by the deployer
books/<slug>/metadata.json        # one per book
books/<slug>/cover.jpg            # JPEG, max 600 px wide, quality 0.85
books/<slug>/<slug>.epub          # the book itself
```

# Slug (book id)

`slug = normalize(title)` (the [Book](/domain/book.md) normaliser) with spaces → `-`,
cut to 80 chars at a `-` boundary. Example: `"Đấu Phá Thương Khung"` → `dau-pha-thuong-khung`.
The slug is the book id in the app. On a collision with a *different* book, the deployer
appends `-2`, `-3`, …; re-uploading the *same* title overwrites (an update).

# metadata.json

```json
{
  "schema": 1,
  "id": "dau-pha-thuong-khung",
  "title": "Đấu Phá Thương Khung",
  "author": "Thiên Tàm Thổ Đậu",
  "genres": ["Huyền huyễn"],
  "description": "…",
  "chapters": 1648,
  "language": "vi",
  "epub": "dau-pha-thuong-khung.epub",
  "size": 2483021,
  "md5": "9e1c…",
  "updatedAt": "2026-11-23T09:00:00.000Z"
}
```

| field | rule |
|---|---|
| id | slug, equals the folder name |
| title | EPUB `dc:title` (first), trimmed; editable in the deployer |
| author | EPUB `dc:creator` joined with ", "; `""` when missing |
| genres | 0..n display names; see [Genre](/domain/genre.md) |
| description | EPUB `dc:description` with HTML stripped, max 1000 chars; `""` when missing |
| chapters | required positive integer: OPF `<meta name="chapters">`, else counted from the content spine items by the deployer on upload (and by "Cập nhật số chương" for older books). Shown in the book popup above the description |
| language | EPUB `dc:language` or `"vi"` |
| epub | file name of the EPUB object inside the folder |
| size | EPUB bytes |
| md5 | hex MD5 of the EPUB bytes (same value Drive reported, so old caches match) |
| updatedAt | ISO time of the upload |

# catalog.json

```json
{ "schema": 1, "generatedAt": "2026-11-23T09:00:00.000Z", "books": [ <metadata>, … ] }
```

`books` is sorted by `id`. The deployer updates it with `If-Match: <etag>` and retries on
412, so two uploads never lose each other's entry.

# Worker HTTP API

Base = `VITE_R2_BASE_URL`, e.g. `https://tu-truyen.<account>.workers.dev`.

| method + path | who | behaviour |
|---|---|---|
| `GET /catalog.json` | app | `Cache-Control: public, max-age=60`, ETag; app sends `cache: 'no-cache'` |
| `GET /books/<slug>/cover.jpg?v=<md5>` | app `<img>` | `Cache-Control: public, max-age=31536000, immutable` |
| `GET /books/<slug>/<slug>.epub?v=<md5>` | app fetch | same caching, `Content-Length`, `Accept-Ranges: bytes`, `Range` → 206 |
| `GET …epub?v=<md5>&download=1` | "Tải" link | adds `Content-Disposition: attachment; filename*=UTF-8''<title>.epub` |
| `HEAD` of any of the above | — | headers only |
| `PUT /admin/<key>` | deployer | bearer token; body = object; `If-Match` honoured; returns `{ key, etag }` |
| `DELETE /admin/<key>` | deployer | bearer token |
| `GET /admin/list?prefix=&cursor=` | deployer | bearer token; `{ objects:[{key,size,etag,uploaded}], cursor? }` |
| `OPTIONS *` | browsers | CORS preflight |

Public paths outside `catalog.json` and `books/**` → 404. Admin without a valid token → 401.
Admin from an origin not in `ADMIN_ORIGINS` → 403. Every response carries
`Access-Control-Allow-Origin` (`*` for public, the echoed allowed origin for admin).

# Failure meanings in the app

- Network error / offline → keep the local catalog as-is.
- 5xx / 429 → retry with backoff (30 s, 60 s, 120 s), keep the last catalog.
- 404 on `catalog.json` → empty library notice "Thư viện chưa có truyện".
- Malformed JSON or `schema` ≠ 1 → "Dữ liệu thư viện không hợp lệ", keep the last catalog.
