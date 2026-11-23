---
type: Playbook
title: Deploy to GitHub Pages
description: Build locally and push dist/ to the gh-pages branch.
status: stable
generated: { by: claude-opus-5-5, at: __NOW__ }
---

# Steps

1. `npm run test && npm run test:e2e`
2. `npm run preview` → load, go offline, reload: shell must render.
3. Owner confirms the deploy.
4. `npm run deploy` (tests → build → postbuild 404.html/.nojekyll → `gh-pages -d dist --dotfiles`).
5. Open `https://<user>.github.io/__REPO__/` and confirm the service worker is active.
