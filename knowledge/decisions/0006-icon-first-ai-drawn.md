---
type: Decision
title: 0006 Icon-first CTA buttons with an AI-drawn icon set
description: Action buttons are icon-only with accessible Vietnamese labels, using a custom SVG set drawn by the architect model per button.
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T05:40:00Z }
verified:
  - { by: human:owner, at: 2026-11-23T06:00:00Z }
---

# Context

The owner asked (2026-11-23) that CTA buttons prefer icons over text, and that the icons be
drawn by AI to fit each button rather than taken from a generic library.

# Decision

- Icon-only `IconButton` for actions; exceptions in [Icon-first actions](/ui/icons.md).
- Icons are hand-authored SVG files in `src/ui/icons/svg/`, inlined at build time
  (`import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true })`),
  so they are part of the precached JS and work offline. No icon font, no icon npm package.
- Accessible names stay the Vietnamese words, so tests query buttons by role + name.

# Consequences

- Discoverability relies on clear drawings + tooltips; the nav keeps labels.
- Adding a button means drawing a new icon (architect task), not picking one from a library.
