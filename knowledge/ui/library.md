---
type: UI Pattern
title: Library grid
description: Cover grid with sticky search, badges, progress bar and Đọc/Tải actions, incrementally rendered.
tags: [library, ui]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Layout

- Sticky search field under the top bar (`type=search`, 16 px+ font, placeholder "Tìm truyện…"),
  filter segment "Tất cả" / "Đã lưu" (icon + label), refresh icon button with last-sync time.
- Grid is a container-query grid of cards: 2 columns at 360 px, `grid-template-columns:
  repeat(auto-fill, minmax(9.5rem, 1fr))` so PC shows 6–8 columns. Cards never cause horizontal scroll.
- Card: cover (aspect 2/3, `object-cover`; placeholder = title on a colour derived from a
  hash of normTitle), title clamped to 2 lines, badge row, thin progress bar + "%" when a
  position exists, two icon-only buttons ≥ 44 px (see [Icon-first actions](/ui/icons.md)): **Đọc** (`read`, primary colour) and **Tải** (`download`).
- Offline: cards that are not cached are dimmed, **Đọc** shows the `cloud-off` icon, disabled, aria-label "Cần mạng để đọc";
  **Tải** stays enabled only for cached books.
- Empty states: no config → setup notice; no results → "Không tìm thấy truyện nào"; first
  sync in progress → skeleton cards.
