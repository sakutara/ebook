# Add donate banner (VietQR) and story requests (Google Form)

## Why
The owner pays for translation tokens and wants readers to chip in, and wants to hear which
titles readers want next. Vocabulary: [Donation](/knowledge/domain/donation.md),
[Story request](/knowledge/domain/story-request.md); decision
[0007](/knowledge/decisions/0007-google-form-write-only-sink.md).

## What changes
- **Donate banner**: a slim banner "Ủng hộ token dịch truyện" pinned to the bottom of every
  non-reader screen (above the mobile tab bar; bottom of the content column on PC). Its
  button opens a dialog: presets 10k/20k/50k/100k, custom amount, a VietQR code generated on
  the device for the env-configured account, bank/name/account and transfer note (from env) shown, copy account number and note,
  and download the QR as PNG.
- **Story request**: new route `#/request` ("Yêu cầu", nav item) with a form: tên truyện
  (required) + tác giả (optional). Input is normalised to NFC Vietnamese Title Case, checked
  against the library and this device's earlier requests, saved locally and sent to a Google
  Form through the outbox. A list of "Đã yêu cầu" with sent/pending state.
- Dexie v3: `storyRequests` table; outbox adapter that delivers `storyRequest.submit` ops.
- New dependency: `qrcode-generator` (no deps, ~20 KB) for QR matrix rendering.

## Offline
- Donate: fully offline (QR built locally from build-time config).
- Story request: saved and queued offline; delivered by the sync engine on reconnect.

## Out of scope
- Verifying payments; reading Google Form responses; cross-device dedup (owner dedups on the
  Sheet's `key` column); spam/captcha; adding missing accents automatically.

## Impact
- Capabilities: donate (ADDED), story-request (ADDED), app-shell (MODIFIED: nav + banner).
- Env: `VITE_DONATE_BANK`, `VITE_DONATE_ACCOUNT_NO`, `VITE_DONATE_ACCOUNT_NAME`, `VITE_DONATE_NOTE` (optional, default `donate token dich truyen`),
  `VITE_REQUEST_FORM_ID`, `VITE_REQUEST_ENTRY_TITLE`, `VITE_REQUEST_ENTRY_AUTHOR`,
  `VITE_REQUEST_ENTRY_KEY` (optional).
