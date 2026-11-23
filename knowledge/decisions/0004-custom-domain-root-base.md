---
type: Decision
title: 0004 Custom domain, root base path
description: The app is served from https://ebook.fiddle.vn/ via GitHub Pages with a CNAME, so the Vite base path is "/".
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Context

The scaffold assumes a project site under `/<repo>/`. The owner wants `https://ebook.fiddle.vn/`.

# Decision

- `vite.config.ts` base defaults to `/`; `public/CNAME` contains `ebook.fiddle.vn` so every
  `gh-pages` deploy keeps the custom domain.
- DNS (owner): `CNAME ebook → <github-user>.github.io`; Pages setting "Enforce HTTPS" on.
- The Drive API key's referrer allow-list uses this domain (see [0002](/decisions/0002-drive-api-key-in-build.md)).

# Consequences

Hash routing is still used (works without 404 tricks). Service-worker scope is `/`.
