# Harden story requests against spam and duplicate titles

## Why
The Google Form behind "Yêu cầu truyện" is public and its IDs ship in the bundle, so it can be
flooded. CSRF does not apply (no session, the endpoint is Google's). The owner chose two
cheap layers that keep [decision 0001](/knowledge/decisions/0001-no-backend-local-first.md):
in-app friction, and clean-up on the Sheet side. Vocabulary:
[Story request](/knowledge/domain/story-request.md); decision
[0007](/knowledge/decisions/0007-google-form-write-only-sink.md) (amended).

## What changes
- **Unique title**: a request is identified by its title only. `key` becomes `normalize(title)`
  (author no longer part of it). The same title with another author is refused.
  Dexie v5 re-keys existing rows; when two rows now share a key, the oldest is kept.
  Backup import re-keys old-format rows before its unique-index guard.
- **Throttle**: at most one request per 10 s per device, measured from the newest
  `storyRequests.createdAt`. Message: "Vui lòng đợi N giây rồi gửi tiếp".
- **Honeypot**: a visually hidden, non-focusable text field. If it is filled, the form shows
  the normal success toast but saves and sends nothing.
- **Sheet de-duplication**: an Apps Script (`scripts/apps-script/dedupe-requests.gs`) bound to the
  response Sheet. An installable `onFormSubmit` trigger deletes the new row when its
  normalised title already exists in an earlier row; `dedupeAll()` cleans existing rows once.
  Setup playbook in `knowledge/playbooks/sheet-dedupe.md`.

## Offline
- Throttle and honeypot are local; unchanged offline behaviour (saved, queued, resync).
- Sheet script runs on Google's side; the app does not depend on it.

## Out of scope
- Stopping direct POSTs to Google (needs a server gate, e.g. Worker + Turnstile).
- Cross-device throttling; IP rate limits; captcha.

## Impact
- Code: `src/domain/request-text.ts`, `src/requests/request-repo.ts`, `src/db/db.ts` (v5),
  `src/data/backup.ts`, `src/ui/request/RequestPage.tsx`, `scripts/apps-script/dedupe-requests.gs`.
- Specs: story-request (MODIFIED De-duplication; ADDED Throttle, Honeypot, Sheet de-duplication).
- Supersedes scenario `story-request.dedup.author-differs`.
