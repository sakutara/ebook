---
type: Playbook
title: Sheet de-duplication
description: Install the Apps Script that deletes duplicate story-request rows in the response Sheet.
tags: [story-request, google-form]
status: draft
generated: { by: claude-opus-5-5, at: 2026-11-24T00:00:00Z }
---

# Why

The app refuses duplicate titles per device, but the same title can still arrive from other
devices or from direct POSTs to the Form. This script keeps one row per normalised title
(accent-, case- and punctuation-insensitive), the earliest one.

# Steps

1. Open the Google Form → Responses → link to a Sheet (if not already).
2. In the Sheet: Extensions → Apps Script. Paste `scripts/apps-script/dedupe-requests.gs`.
3. Set `TITLE_HEADER` to the exact header of the title column (the question text, e.g. `Tên truyện`).
4. Save. Run `dedupeAll` once from the editor and accept the permission prompt. Existing
   duplicates and empty titles are deleted, the first occurrence is kept.
5. Triggers (clock icon) → Add trigger → function `onFormSubmit`, event source
   "From spreadsheet", event type "On form submit". Save.
6. Test: submit the same title twice from the app on two devices (or the Form itself); the
   second row disappears within a few seconds.

# Notes

- Deleting rows in the Sheet does not delete responses inside the Form (Form → Responses keeps
  them, and "Unlink"/re-link would bring them back). The Sheet is the working list.
- The response sheet must be the first tab, or the trigger's own sheet is used (`e.range.getSheet()`).
- When the app's `normalize` (src/domain/title.ts) changes, update `normalizeTitle` in the script too
  (tests/unit/sheet-dedupe.test.ts compares them).
