---
type: Decision
title: 0008 Cloudflare R2 behind a Worker as the book source
description: Books, covers and metadata move from a public Drive folder to an R2 bucket served by a small Cloudflare Worker; supersedes 0002 and narrows 0001.
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-23T09:00:00Z }
---

# Context

Reading straight from a public Google Drive folder ([0002](/decisions/0002-drive-api-key-in-build.md))
has four problems the owner hit or expects to hit:

- Drive throttles popular public files ("Download quota exceeded", ~24 h lock-out) and the
  API key's quota is shared by every reader.
- Drive can flag and unshare the folder, taking the whole library down at once.
- Drive has no cover thumbnails, so the library can only show covers of books already
  downloaded; extracting covers by `Range` reads costs several requests per book.
- Every app start pays for a paged API listing instead of one cacheable file.

The owner asked (2026-11-23) to move to Cloudflare R2 + a Worker and to build an uploader
("R2 deployer") in the same repo.

# Decision

- **Storage**: one R2 bucket. Per book, a folder `books/<slug>/` holding exactly three
  objects: `cover.jpg`, `metadata.json`, `<slug>.epub`. A root `catalog.json` aggregates all
  `metadata.json` so the app needs one request to list the library. Layout and schemas:
  [R2 source](/domain/r2-source.md).
- **Gateway**: a Cloudflare Worker (`worker/`, deployed with `wrangler` to `*.workers.dev`
  because `fiddle.vn` DNS is not on Cloudflare) with an R2 binding.
  - Public, read-only: `GET`/`HEAD` of `catalog.json` and `books/**`, with CORS `*`,
    `Range`, `ETag`, edge caching, and `?download=1` → `Content-Disposition: attachment`.
  - Admin, write: `PUT`/`DELETE /admin/<key>` and `GET /admin/list`, guarded by a bearer
    token (`ADMIN_TOKEN` Worker secret) and an origin allow-list. Used only by the deployer.
- **App config**: `VITE_R2_BASE_URL` (the Worker origin) replaces `VITE_GD_API_KEY` and
  `VITE_GD_FOLDER_ID`. There is no key in the build any more.
- **Uploader**: the deployer is a separate local-only page in this repo
  (`npm run deployer`), never built into `dist/`. It parses EPUBs in the browser and writes
  through the Worker admin API.

# What this changes in 0001

[0001](/decisions/0001-no-backend-local-first.md) still holds for *user* data: reading
positions, cache, preferences and story requests stay in IndexedDB only. The Worker is a
stateless file gateway for the owner's *published* books; it stores nothing about readers
and has no accounts. The Google Form sink ([0007](/decisions/0007-google-form-write-only-sink.md)) is unchanged.

# Consequences

- Zero egress cost; free tier = 10 GB storage, 10 M reads/month, Worker 100 k requests/day.
  Above 10 GB the owner pays ~$0.015/GB-month.
- The owner must create a Cloudflare account, the bucket and the Worker secret once
  ([Deploy R2 worker](/playbooks/deploy-r2-worker.md)).
- Book ids change from Drive file ids to slugs. Existing caches and positions are carried over
  by md5 / normalised title on the first R2 sync (see the catalog spec).
- Drive is no longer read by the app. The owner may keep using Drive as a personal inbox, but
  publishing happens only through the deployer.
- Supersedes [0002](/decisions/0002-drive-api-key-in-build.md).
