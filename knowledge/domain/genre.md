---
type: Domain Concept
title: Genre
description: The chủ đề (genre) labels a book carries, the known list, and how they are derived from EPUB subjects and filtered in the library.
tags: [catalog, library, deployer]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-23T09:00:00Z }
---

# Known genres

| display name | normalised key | EPUB `dc:subject` aliases (normalised) |
|---|---|---|
| Tiên hiệp | `tien hiep` | `tien hiep`, `xianxia`, `tu tien` |
| Huyền huyễn | `huyen huyen` | `huyen huyen`, `xuanhuan`, `fantasy` |
| Khoa huyễn | `khoa huyen` | `khoa huyen`, `sci fi`, `science fiction`, `scifi` |

The list lives in `src/domain/genre.ts` and is shared by the app and the deployer.

# Rules

- A book has 0..n genres, stored as display names in `metadata.json.genres`.
- The deployer pre-fills genres from `dc:subject` values that match an alias; other subjects
  are kept as-is (title-cased) so the owner can add new genres without a code change. The
  owner can edit the list before uploading.
- The library genre filter lists the **known genres first, then any other genre found in the
  catalog**, alphabetically, each with its book count. Only genres with ≥ 1 visible book are shown.
- Matching is by normalised key, so `"tiên hiệp"`, `"Tiên Hiệp"` and `"tien hiep"` are the same genre.
