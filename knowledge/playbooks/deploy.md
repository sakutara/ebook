---
type: Playbook
title: Deploy to GitHub Pages
description: Build locally and push dist/ to the gh-pages branch.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:39:36Z }
---

# Steps

1. `npm run test && npm run test:e2e`
2. `npm run preview` → load, go offline, reload: shell must render.
3. Owner confirms the deploy.
4. `npm run deploy` (tests → build → postbuild 404.html/.nojekyll → `gh-pages -d dist --dotfiles`).
5. Open `https://ebook.fiddle.vn/` and confirm the service worker is active and the library loads (Drive key referrer allows the domain).
