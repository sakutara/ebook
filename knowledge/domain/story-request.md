---
type: Domain Concept
title: Story request
description: A reader's wish for a title (and author) to be added; normalised to Vietnamese Title Case and de-duplicated by an accent-free key.
tags: [story-request, normalisation]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T08:00:00Z }
---

# Shape

| field | example (input → stored) |
|---|---|
| title (required, 1–200 chars after cleaning) | `  phàm   nhân TU TIÊN truyện ` → `Phàm Nhân Tu Tiên Truyện` |
| author (optional, ≤ 100 chars) | `vong ngữ` → `Vong Ngữ` |
| originalTitle (optional, ≤ 200 chars) | `凡人修仙传` → `凡人修仙传` (title-case leaves CJK as is) |
| language (optional, dropdown) | one of `REQUEST_LANGUAGE_OPTIONS` (`src/domain/request-languages.ts`): Trung, Anh, Nhật, Hàn, Pháp, Đức, Nga, Tây Ban Nha, Thái, or "Ngôn ngữ khác". Stored as picked, no title-case. Vietnamese is not offered |
| key | `pham nhan tu tien truyen|vong ngu` |

`originalTitle` and `language` are stored and sent to the Form but do not affect `key` or
duplicate checks. Each is posted to its own entry id only when that id is configured and the
value is non-empty (`VITE_REQUEST_ENTRY_ORIGINAL_TITLE`, `VITE_REQUEST_ENTRY_LANGUAGE`).

# Normalisation (`src/domain/request-text.ts`)

1. Unicode NFC (merges decomposed marks typed on some keyboards, e.g. `à` → `à`).
2. Replace zero-width / control chars, smart quotes; trim; collapse whitespace.
3. Strip wrapping quotes/brackets and trailing punctuation (`"Đấu Phá"!` → `Đấu Phá`).
4. Vietnamese Title Case: each space- or hyphen-separated word → first letter upper
   (`toLocaleUpperCase('vi')`, so `đ` → `Đ`), rest lower. Roman numerals (`ii`, `iv`, `x`…)
   stay all-caps. Digits unchanged.
5. Accent recovery: if `normalize(title)` (accent-free, /knowledge/domain/book.md) equals a
   catalog book's `normTitle`, the request is a duplicate of a book already in the library.

**key** = `normalize(title) + '|' + normalize(author)` — accent-, case- and
punctuation-insensitive, so "Pham nhan tu tien" and "Phàm Nhân Tu Tiên" collide.

# Accents

The app cannot add missing accents reliably. When the title contains only ASCII letters the
form warns "Tên truyện chưa có dấu" and asks for confirmation before sending (some titles are
legitimately non-Vietnamese, e.g. "Harry Potter").

# Duplicate rules

- Same key already in `storyRequests` on this device → refused: "Bạn đã yêu cầu truyện này".
- Title matches a catalog book → refused: "Truyện đã có trong thư viện" + link to search it.
