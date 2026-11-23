---
type: Domain Concept
title: Reading position
description: Where the reader stopped in a book, stored as a layered anchor so it survives cache refreshes and edits to the book.
tags: [reader, progress]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Why layered

An EPUB CFI points into exact DOM structure. When the owner fixes typos or re-exports the
book, the CFI may point to the wrong place or nowhere. So each saved position carries
several anchors, tried from most to least precise.

# Anchor (one per book)

| part | from foliate-js | used when |
|---|---|---|
| `cfi` | `view` `relocate` → `detail.cfi` | book version unchanged (md5 equal) → used directly |
| `snippet` | first ≤ 120 chars of `detail.range.toString()` (whitespace collapsed) | version changed: CFI is accepted only if the text at the resolved CFI starts with the snippet's first 40 normalised chars; else the snippet is searched for in the whole section text (longest key first: full, 80, 40 chars) and, if it occurs several times, the occurrence nearest `sectionFraction` wins — it lands on the exact character, not just the paragraph |
| `sectionIndex`, `sectionHref`, `sectionFraction` | `view.renderer` `relocate` → `detail.index`, `book.sections[index].id`, `detail.fraction` | snippet not found: go to the section (by href first, index second) at that fraction |
| `fraction` | `view` `relocate` → `detail.fraction` | section not found: `view.goToFraction(fraction)` |
| `bookMd5` | the cached file's md5 | decides whether CFI can be trusted blindly |

After restoring, the reader immediately saves a fresh anchor with the new `bookMd5`.

# Known engine quirk

foliate-js ignores navigation calls for ~100 ms after each page turn (its paginator lock); the TOC
is disabled until the book is ready so a pick is never silently lost.

# Lifetime

- Independent of the cache: clearing a book's cache, or the whole cache, does **not** clear
  its position. Only "Xoá tiến độ đọc" in Settings or deleting via export/import does.
- Re-attachment: when the catalog sees a *new* Drive id whose `normTitle` equals the
  `normTitle` of a position whose book is no longer in Drive, the position is copied to the
  new id (the version check then routes through the snippet path).

Data: [progress](/data/progress.md). Spec: /openspec/specs/progress/spec.md
