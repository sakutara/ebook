---
type: Decision
title: 0002 Google Drive API key in the build
description: The app reads the public Drive folder with a referrer-restricted browser API key baked into the static build, no OAuth, no proxy.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Context

There is no backend (see [0001](/decisions/0001-no-backend-local-first.md)). Listing a Drive
folder and reading file bytes from the browser needs the Drive API v3, which accepts an API
key for publicly shared files and sends CORS headers. Scraping the Drive web UI is fragile
and blocked by CORS.

# Decision

- `VITE_GD_API_KEY` and `VITE_GD_FOLDER_ID` are read from `.env.local` (git-ignored) at
  build time; `.env.example` documents them. They end up public in `dist/` — that is
  accepted because the key can only read public files.
- The owner restricts the key in Google Cloud Console: API restriction = Google Drive API
  only; application restriction = HTTP referrers `https://ebook.fiddle.vn/*`,
  `http://localhost:*/*`, `http://127.0.0.1:*/*`.
- If either value is missing the app still runs and shows a setup notice instead of the
  library (cached books stay readable).

# Consequences

- Anyone can copy the key, but it is useless outside the allowed referrers and can only read
  public data. Daily Drive API quota is shared by all users of the site.
- The download button uses a plain Drive link (no key) so it works even if the key is broken.
