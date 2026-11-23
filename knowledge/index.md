---
okf_version: "0.2"
---

# Product

* [Overview](product/overview.md) - Tủ Truyện: EPUB library served from Cloudflare R2, offline reading, resume

# Decisions

* [0001 No backend, local-first](decisions/0001-no-backend-local-first.md) - Data lives only in IndexedDB until explicitly changed
* [0002 Drive API key in the build](decisions/0002-drive-api-key-in-build.md) - Superseded by 0008
* [0003 foliate-js reader](decisions/0003-foliate-js-reader.md) - EPUB rendering engine and zip reader
* [0004 Custom domain, root base](decisions/0004-custom-domain-root-base.md) - ebook.fiddle.vn, base "/", CNAME
* [0005 Full catalog, local search](decisions/0005-full-catalog-local-search.md) - What "lazy load" and "quick search" mean here
* [0006 Icon-first, AI-drawn icons](decisions/0006-icon-first-ai-drawn.md) - CTA buttons are icon-only with a custom SVG set
* [0007 Google Form write-only sink](decisions/0007-google-form-write-only-sink.md) - Story requests POSTed to a public Form; no reads back
* [0008 R2 + Worker book source](decisions/0008-r2-worker-book-source.md) - Bucket layout, public/admin Worker, deployer page

# Domain

* [R2 source](domain/r2-source.md) - Bucket layout, metadata/catalog schemas, Worker API
* [Genre](domain/genre.md) - Known genres, aliases from dc:subject, filter rules
* [Drive source](domain/drive-source.md) - Deprecated: the old public Drive folder
* [Book](domain/book.md) - Identity, title normalisation, version, cached/stale/local-only states
* [Reading position](domain/reading-position.md) - Layered anchor that survives cache refresh and edits
* [Donation](domain/donation.md) - VietQR built on device from env bank config, amount and note
* [Story request](domain/story-request.md) - Title/author normalisation to Vietnamese Title Case, dedup key

# Data

* [books](data/books.md) - Local catalog mirror of the Drive folder
* [bookFiles](data/book-files.md) - Cached EPUB blobs
* [covers](data/covers.md) - Dropped in v4 (covers come from R2)
* [progress](data/progress.md) - Reading positions (synced via outbox, exported)
* [storyRequests](data/story-requests.md) - Story requests made on this device (outbox → Google Form, exported)

# UI

* [App shell layout](ui/app-shell.md) - Mobile bottom bar, PC side nav, fluid tokens
* [Library grid](ui/library.md) - Cover grid, search, badges, Đọc/Tải
* [Reader](ui/reader.md) - Full-screen paginated reader, TOC, typography
* [Icon-first actions](ui/icons.md) - IconButton rule, exceptions, the icon set and its labels

# Playbooks

* [Deploy to GitHub Pages](playbooks/deploy.md) - Local build and gh-pages push to ebook.fiddle.vn
* [Deploy the R2 Worker](playbooks/deploy-r2-worker.md) - Cloudflare bucket, secret, wrangler deploy
* [Publish books](playbooks/publish-books.md) - R2 deployer: upload EPUBs, review metadata, delete, rebuild catalog
