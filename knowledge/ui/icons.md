---
type: UI Pattern
title: Icon-first actions
description: Action (CTA) buttons show a custom, AI-drawn SVG icon instead of text; the Vietnamese label lives in aria-label and the tooltip.
tags: [ui, icons, a11y]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T05:40:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Rule

Every action button is an **icon-only button** (`IconButton`): a 24 px icon in a ≥ 44×44 px
hit area, with the Vietnamese label as `aria-label` *and* `title` (tooltip on PC).
Text labels are kept only where an icon alone would be ambiguous or risky:

| element | shows |
|---|---|
| card / reader / settings / top-bar actions | icon only |
| primary nav (bottom tabs, side nav) | icon + label |
| filter segment "Tất cả" / "Đã lưu" | icon + label |
| genre chips, author select, "Xoá bộ lọc" (move-books-to-r2) | text only — values are names, no metaphor fits |
| download cancel "Huỷ tải" | icon only (`close`) |
| buttons inside a confirm `<dialog>` (destructive) | icon + text |
| donate banner button, form submit buttons | icon + text |
| disabled state | different icon (e.g. cloud-off) + its own aria-label |

# The icon set

Drawn for this app by Claude (claude-opus-5-5) — not taken from an icon library — and stored
as source assets in `src/ui/icons/svg/*.svg`. Style: 24×24 viewBox, stroke
`currentColor` 1.75 px, round caps/joins, no fill except a soft
`fill-opacity .18` accent shape; they inherit text colour so themes and dark mode just work.
Only the architect changes or adds icons (a new button = a new drawing that reflects what the
button does), then updates the table below.

| icon file | drawing | used for (aria-label) |
|---|---|---|
| read | open book with a bookmark ribbon | Đọc |
| download | arrow dropping into a tray | Tải |
| cloud-off | cloud struck through | Cần mạng để đọc / Cần mạng để tải |
| refresh | two chasing arrows | Làm mới |
| retry | circular arrow with "!" | Thử lại |
| search | magnifier with glint | Tìm truyện (input adornment) |
| close | × | Xoá tìm kiếm / Đóng |
| filter-all | 2×2 grid | Tất cả |
| filter-saved | phone with a check | Đã lưu |
| library | books on a shelf | Thư viện (nav) |
| settings | 8-tooth gear | Cài đặt (nav) |
| back | arrow left | Về thư viện |
| toc | bulleted list | Mục lục |
| typography | "Aa" | Tuỳ chỉnh chữ |
| font-smaller / font-larger | A− / A+ | Chữ nhỏ hơn / Chữ lớn hơn |
| line-height | lines with a vertical double arrow | Giãn dòng |
| theme-light / theme-sepia / theme-dark | sun / page with text / moon with star | Nền sáng / Nền sepia / Nền tối |
| trash | bin | Xoá bản lưu |
| trash-all | bin holding stacked books | Xoá toàn bộ cache |
| progress-clear | bookmark with × | Xoá tiến độ đọc |
| export / import | arrow out of a box / document with arrow in | Xuất dữ liệu / Nhập dữ liệu |
| confirm | check | (dialog) Xác nhận |
| update | up-arrow in a circle with a sparkle | Cập nhật phiên bản mới |
| donate | heart above an open hand | Ủng hộ (banner, icon + text) |
| copy | two offset sheets | Sao chép số tài khoản / Sao chép nội dung |
| send | paper plane | Gửi yêu cầu (form submit, icon + text) |
| request | book with a plus badge | Yêu cầu (nav) |

Spec: /openspec/specs/app-shell/spec.md (Requirement "Icon-first actions").
