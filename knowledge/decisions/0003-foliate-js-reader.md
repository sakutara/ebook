---
type: Decision
title: 0003 foliate-js as the EPUB engine
description: Render EPUBs with foliate-js (npm foliate-js@1.0.1, MIT) instead of epub.js.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Context

The reader needs paginated EPUB rendering on mobile, CFI locations, section/fraction
progress and text search inside a section, all client-side.

# Decision

Use `foliate-js` 1.0.1 (`<foliate-view>` web component from `foliate-js/view.js`). It
bundles its own zip reader (`vendor/zip.js`), emits `relocate` with `cfi`, `fraction`,
`range`, and its renderer emits `relocate` with section `index` + in-section `fraction`.
The library only feeds it a `File` built from the cached Blob.

The same bundled `vendor/zip.js` is reused for cover extraction over HTTP Range (a custom
zip.js `Reader`), so no second zip library is added.

# Consequences

- foliate-js is ESM with dynamic imports for MOBI/FB2/PDF/comic; Vite must build them as
  separate chunks that are never loaded for EPUB. They are precached (small) but unused.
- epub.js (unmaintained since 2020) is not used.
