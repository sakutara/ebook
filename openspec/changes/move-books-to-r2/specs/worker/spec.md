## ADDED Requirements

### Requirement: Public read-only gateway
The Worker SHALL serve `GET` and `HEAD` for `catalog.json` and any key under `books/` from the R2 binding `BOOKS`, with `Access-Control-Allow-Origin: *`, `ETag`, `Content-Type` (`application/json`, `image/jpeg`, `application/epub+zip`) and `Content-Length`. Every other public path SHALL answer 404. Other methods on public paths SHALL answer 405.

#### Scenario: worker.public.catalog
- **GIVEN** the bucket holds `catalog.json`
- **WHEN** `GET /catalog.json` is requested
- **THEN** the answer is 200 with the object body, `Content-Type: application/json; charset=utf-8`, an `ETag`, `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: *`

#### Scenario: worker.public.immutable
- **WHEN** `GET /books/a/cover.jpg?v=m1` is requested and the object exists
- **THEN** the answer is 200 with `Content-Type: image/jpeg` and `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: worker.public.not-found
- **WHEN** `GET /books/missing/cover.jpg` or `GET /secret.txt` is requested
- **THEN** the answer is 404 with `Access-Control-Allow-Origin: *`

#### Scenario: worker.public.not-modified
- **GIVEN** `catalog.json` has ETag `"e1"`
- **WHEN** it is requested with `If-None-Match: "e1"`
- **THEN** the answer is 304 with no body

### Requirement: Range and download
For EPUB objects the Worker SHALL honour a single `Range: bytes=a-b` header with 206 and `Content-Range`, advertise `Accept-Ranges: bytes`, and when the query has `download=1` add `Content-Disposition: attachment; filename*=UTF-8''<percent-encoded file name>` where the file name is the `title` from the book's `metadata.json` plus `.epub`, falling back to the object's file name.

#### Scenario: worker.range.partial
- **GIVEN** `books/a/a.epub` is 1000 bytes
- **WHEN** it is requested with `Range: bytes=0-99`
- **THEN** the answer is 206 with 100 bytes and `Content-Range: bytes 0-99/1000`

#### Scenario: worker.download.disposition
- **GIVEN** `books/dau-pha/metadata.json` has title "Đấu Phá"
- **WHEN** `GET /books/dau-pha/dau-pha.epub?download=1` is requested
- **THEN** the answer has `Content-Disposition: attachment; filename*=UTF-8''%C4%90%E1%BA%A5u%20Ph%C3%A1.epub`

### Requirement: Edge cache
Full `GET` answers (status 200, no `Range`, no `download`) for paths with a `v` query parameter SHALL be stored in and served from the Workers Cache API keyed by the full URL.

#### Scenario: worker.cache.hit
- **GIVEN** `GET /books/a/a.epub?v=m1` was answered once
- **WHEN** it is requested again
- **THEN** the answer comes from the cache and the bucket is not read

### Requirement: Admin API
The Worker SHALL accept `PUT /admin/<key>`, `DELETE /admin/<key>` and `GET /admin/list?prefix=&cursor=` only with `Authorization: Bearer <ADMIN_TOKEN>` and only from an `Origin` in the comma-separated `ADMIN_ORIGINS` (no `Origin` header is allowed). `PUT` SHALL answer `{ key, etag, size }`.

#### Scenario: worker.admin.unauthorized
- **WHEN** `PUT /admin/catalog.json` has no token or a wrong token
- **THEN** the answer is 401 and the bucket is unchanged

#### Scenario: worker.admin.origin
- **GIVEN** `ADMIN_ORIGINS` is `http://localhost:5174`
- **WHEN** a valid-token `PUT` comes with `Origin: https://evil.example`
- **THEN** the answer is 403

#### Scenario: worker.admin.put
- **WHEN** a valid `PUT /admin/books/a/metadata.json` with a JSON body is sent
- **THEN** the object is stored with `Content-Type: application/json; charset=utf-8` and the answer is 200 `{ key, etag, size }`

### Requirement: Admin key whitelist
Admin keys SHALL be `catalog.json` or `books/<slug>/(cover.jpg|metadata.json|<slug>.epub)` with `slug` matching `[a-z0-9]+(-[a-z0-9]+)*`; others SHALL answer 400.

#### Scenario: worker.admin.bad-key
- **WHEN** a valid `PUT /admin/books/A B/x.exe` is sent
- **THEN** the answer is 400 and nothing is stored

### Requirement: Conditional admin writes
`PUT` SHALL honour `If-Match: <etag>` with 412 on mismatch.

#### Scenario: worker.admin.if-match
- **GIVEN** `catalog.json` has ETag `"e2"`
- **WHEN** `PUT /admin/catalog.json` is sent with `If-Match: "e1"`
- **THEN** the answer is 412 and the object is unchanged

#### Scenario: worker.admin.list
- **GIVEN** the bucket holds 3 keys under `books/a/`
- **WHEN** `GET /admin/list?prefix=books/a/` is sent with a valid token
- **THEN** the answer lists the 3 keys with size and etag

### Requirement: Admin CORS preflight
`OPTIONS` from an allowed origin SHALL answer 204 echoing the origin, methods `GET, PUT, DELETE, OPTIONS` and headers `Authorization, Content-Type, If-Match`.

#### Scenario: worker.admin.preflight
- **WHEN** `OPTIONS /admin/catalog.json` comes from an allowed origin
- **THEN** the answer is 204 with `Access-Control-Allow-Origin` echoing that origin and `Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS`
