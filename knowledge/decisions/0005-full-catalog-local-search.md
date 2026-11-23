---
type: Decision
title: 0005 Fetch the full catalog, search and paginate locally
description: The whole folder listing is mirrored into IndexedDB; "lazy load" is incremental rendering plus on-demand covers, and quick search runs locally.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Context

The user wants lazy loading and quick search. Drive's `name contains` search is
case-insensitive but not diacritic-insensitive, needs the network and costs quota per
keystroke.

# Decision

- Catalog sync pages through the whole folder (200 per page, each page written to Dexie as it
  arrives so the first covers show after the first response).
- The library renders 40 cards, then 40 more each time a sentinel scrolls into view.
- Covers are fetched only for cards in (or near, 300 px rootMargin) the viewport, max 3 at a time.
- Search filters the local catalog with the diacritic-insensitive normaliser; works offline.

# Consequences

A folder of a few thousand books is a few hundred KB of metadata — fine for IndexedDB.
Above ~20 000 books this should be revisited.
