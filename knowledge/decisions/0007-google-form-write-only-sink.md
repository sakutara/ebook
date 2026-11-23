---
type: Decision
title: Google Form as a write-only sink for story requests
description: Story requests are POSTed to a public Google Form; the app never reads responses back. Narrow exception to 0001.
tags: [backend, sync, story-request]
status: stable
generated: { by: claude-opus-5-5, at: 2026-11-23T08:00:00Z }
---

# Context

The owner asked (2026-11-23) for a "Yêu cầu truyện" form whose submissions are stored in a
Google Form. Decision 0001 forbids a backend; a Google Form is a hosted third-party store.

# Decision

- Allowed: one fire-and-forget `POST https://docs.google.com/forms/d/e/<formId>/formResponse`
  per request, `mode: 'no-cors'`, `application/x-www-form-urlencoded`, fields `entry.<id>`.
  Form ID and entry IDs come from build env vars (`VITE_REQUEST_FORM_*`).
- The response is opaque: a resolved `fetch` counts as delivered, a rejected one (network) as failed.
- No reads from Google: dedup is per device (IndexedDB) plus a normalised `key` field the owner
  can de-duplicate on in the linked Sheet (`=UNIQUE()`).
- Requests go through the outbox like any other write, so they survive offline and resync.
- 0001 stays in force for everything else.

# Consequences

- Cross-device duplicates reach the Form; the Sheet-side `key` column handles them.
- Anyone can POST to a public Form; spam control is out of scope.
