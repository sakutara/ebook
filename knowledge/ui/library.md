---
type: UI Pattern
title: Library grid
description: Cover grid with search, genre and author filters, R2 covers, download progress, badges and Đọc/Tải actions, incrementally rendered.
tags: [library, ui]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Layout

- Search field under the top bar (`type=search`, placeholder "Tìm truyện…"; matches title and author).
- Row 1: filter segment "Tất cả" / "Đã lưu" (icon + label), last-sync time, refresh.
- Row 2: genre chips (radiogroup "Thể loại": "Tất cả thể loại", Tiên hiệp, Huyền huyễn, Khoa huyễn, then others, each with a count) and the "Tác giả" select. On phones the chips scroll sideways inside their own row and the select is full width; from 768 px chips wrap and the select (14 rem) sits on their right. "Xoá bộ lọc" appears when search, genre or author is active.
- Grid only (the list layout was removed in move-books-to-r2): 2 columns at 360 px, `repeat(auto-fill, minmax(9rem, 1fr))` above, ≥ 6 columns at 1280 px.
- Card: cover (aspect 2/3) = `cover.jpg` from R2 for every book in the catalog, loaded lazily by the browser and cached by the service worker; until it loads, or when it is missing, a placeholder with the title on a colour from normTitle. Title (2 lines), author (1 line), badges, reading-progress bar + "%", and two icon-only buttons ≥ 44 px: **Đọc** (`read`) and **Tải** (`download`). Tapping the cover = Đọc.
- While an EPUB downloads (Đọc or Tải on an uncached book) the two buttons are replaced by a progress bar "Đang tải N%" (indeterminate "Đang tải…" when the size is unknown) and an icon-only **Huỷ tải** (`close`).
- Offline: cards that are not cached are dimmed, **Đọc** shows the `cloud-off` icon, disabled, aria-label "Cần mạng để đọc";
  **Tải** stays enabled only for cached books.
- Empty states: no config → setup notice; no results → "Không tìm thấy truyện nào"; first
  sync in progress → skeleton cards.
