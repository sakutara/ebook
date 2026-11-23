---
type: Product
title: Tủ Truyện
description: PWA that lists EPUB books published to a Cloudflare R2 bucket, lets the reader download or read them in-app, and keeps downloaded books and reading position on the device.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Purpose

Tủ Truyện turns one public Google Drive folder of `.epub` files into a phone-friendly
library: browse covers, search by title, download the file, or read it in the browser and
pick up exactly where you stopped — even offline, even after the book was updated or
removed on Drive.

# Users

- Primary: one person (the owner) and friends reading Vietnamese novels on a phone, often
  offline (commute), installed to the home screen.
- Secondary: the same people on a desktop browser.

# Source of books

An R2 bucket served by a Cloudflare Worker, one folder per book (EPUB, cover, metadata), filled with the R2 deployer. See
[R2 source](/domain/r2-source.md), [Genre](/domain/genre.md) and [Book](/domain/book.md).

# Hosting

Static build on https://ebook.fiddle.vn/ — see [0004 Custom domain](/decisions/0004-custom-domain-root-base.md).

# Constraints

See [0001 No backend, local-first](/decisions/0001-no-backend-local-first.md),
[0002 Drive API key in the build](/decisions/0002-drive-api-key-in-build.md),
[0003 foliate-js reader](/decisions/0003-foliate-js-reader.md) and
[App shell layout](/ui/app-shell.md). Behaviour lives in `/openspec/specs/`.

# Out of scope (for now)

MOBI/PRC/PDF, sub-folders, multiple Drive folders, accounts, cross-device progress sync,
annotations/highlights, full-text search across books.
