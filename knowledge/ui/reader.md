---
type: UI Pattern
title: Reader
description: Full-screen paginated reader with auto-hiding chrome, TOC, typography settings and progress.
tags: [reader, ui]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T04:50:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Layout

- Route `#/read/<bookId>`; hides the app's bottom tabs/side nav.
- `<foliate-view>` fills the viewport (`min-h-dvh`, safe-area padding).
- Tap left 30 % → previous page, right 30 % → next page, middle → toggle chrome. Swipe is
  handled by foliate. PC: ←/→/PageUp/PageDown/Space, Esc closes overlays.
- Chrome (hidden by default after open): top bar = icon buttons back, title, TOC, typography ([icons](/ui/icons.md)); bottom bar =
  section title, % read, range slider (`goToFraction` on release).
- TOC: full-screen sheet on narrow; left side panel (20 rem) on `lg` that stays open.
- Typography sheet (icon buttons A−/A+, line-height, three theme icons): font size 80–160 % (step 10), line height 1.4/1.6/1.8, theme Sáng / Sepia / Tối.
  Stored in `settings` key `reader.prefs`; applied via `renderer.setStyles`.
- Column width capped at ~40 rem on wide screens (`renderer` attribute `max-inline-size`).
- Loading overlay with download % while a book is being fetched; notices as a toast.
