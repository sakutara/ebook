# Tasks — add-donate-and-story-request

Rules for every task: strict TDD (failing run first, then passing full suite). Test names
start with the scenario ID. Do not edit `openspec/**`, `knowledge/**` or `src/ui/icons/svg/*`.
Design reference: `design.md` section numbers in brackets. Full suite: `npx vitest run`.

## 1. Config and pure domain

- [x] 1.1 Donate domain: banks, VietQR payload, note, amounts [2]
  - Scenarios: donate.qr.payload, donate.qr.bank-alias, donate.note.default, donate.note.env, donate.note.too-long, donate.amount.invalid (parseAmount)
  - Files: src/donate/banks.ts, src/donate/vietqr.ts, tests/unit/vietqr.test.ts
  - Test: npx vitest run tests/unit/vietqr.test.ts
  - Done when: `crc16('123456789')==='29B1'`; `buildVietQr({bin:'970436',accountNo:'0123456789',amount:20000,note:'donate token dich truyen'})` contains every substring listed in donate.qr.payload, starts `000201010212`, ends with `6304`+crc16 of everything before the crc; `resolveBank('vcb'|'Vietcombank'|'970436'|' viet com bank ')` → bin 970436 name Vietcombank, `resolveBank('xyz')` null; `cleanNote(undefined|'')==='donate token dich truyen'`, `cleanNote('Ủng hộ Tủ Truyện!')==='Ung ho Tu Truyen'`, 40-char note → ≤25 chars no trailing space; `formatVnd(50000)==='50.000'`, `formatVnd(1000000)==='1.000.000'`; `parseAmount('35.000')===35000`, `parseAmount('999')`, `parseAmount('')`, `parseAmount('50000001')` → null.

- [x] 1.2 QR matrix + SVG [2]
  - Scenarios: donate.qr.offline (rendering is local)
  - Files: package.json (`npm i qrcode-generator`), src/donate/qr-matrix.ts, tests/unit/qr-matrix.test.ts, src/ui/icons/Icon.tsx (append 'donate','copy','send','request' to ICON_NAMES only — the SVGs already exist)
  - Test: npx vitest run tests/unit/qr-matrix.test.ts tests/unit/icons.test.tsx
  - Done when: `qrMatrix(payload)` is square, size = 17+4·version, top-left 7×7 finder pattern correct (row 0 cols 0–6 all true, row 1 col 1–5 false); `qrSvg` returns an `<svg` with `viewBox="0 0 {n+8} {n+8}"`, one `<path`, `shape-rendering="crispEdges"`, no `<script`.

- [x] 1.3 Config readers [1]
  - Scenarios: donate.banner.config-missing (config), story-request.config.missing (config)
  - Files: src/config.ts, src/vite-env.d.ts, .env.example, tests/unit/config.test.ts
  - Test: npx vitest run tests/unit/config.test.ts
  - Done when: `getDonateConfig` returns `{bin:'970436',bankName:'Vietcombank',accountNo:'0123456789',accountName:'NGUYEN VAN A',note:'donate token dich truyen'}` for the e2e env values (accountNo `'0123 456.789'` → digits); null if any of the 3 required is empty/whitespace or bank unknown; note from `VITE_DONATE_NOTE` passed through `cleanNote`. `getRequestFormConfig`: `'entry.111'` and `'111'` both → `'111'`; null without formId or entryTitle; entryKey undefined when empty. Existing `getDriveConfig` tests still pass.

- [x] 1.4 Request text normalisation [4]
  - Scenarios: story-request.normalize.title-case, story-request.normalize.nfc, story-request.normalize.punctuation, story-request.normalize.no-accent-warning (lacksDiacritics)
  - Files: src/domain/request-text.ts, tests/unit/request-text.test.ts
  - Test: npx vitest run tests/unit/request-text.test.ts
  - Done when: every example in those scenarios holds (inputs/outputs verbatim); also `'tường vi'`→`'Tường Vi'`, `'x-men'`→`'X-Men'`, `'(đấu phá)'`→`'Đấu Phá'`, `'a​b'`→`'Ab'`; `requestKey('Phàm Nhân Tu Tiên','Vong Ngữ')==='pham nhan tu tien|vong ngu'`; `lacksDiacritics('pham nhan')` true, `('Phàm')` false, `('123')` false.

## 2. Data and delivery

- [x] 2.1 Dexie v3 storyRequests + import unique-index guard [5]
  - Scenarios: story-request.backup.roundtrip (storage part)
  - Files: src/db/db.ts, src/data/backup.ts, tests/unit/db.v3.test.ts
  - Test: npx vitest run tests/unit/db.v3.test.ts tests/unit/db.v2.test.ts
  - Done when: a v2 DB with a progress row opens at v3 intact; adding two rows with the same `key` throws ConstraintError; export includes `storyRequests`; importing a backup whose row has the same key but different id as an existing row skips it and imports the other rows.

- [x] 2.2 Request repository [5]
  - Scenarios: story-request.dedup.device, story-request.dedup.library, story-request.dedup.author-differs, story-request.submit.offline (data), story-request.backup.roundtrip, story-request.form.required (empty)
  - Files: src/requests/request-repo.ts, tests/unit/request-repo.test.ts
  - Test: npx vitest run tests/unit/request-repo.test.ts
  - Done when: each scenario passes on fake-indexeddb with a fresh DB per test; a saved request writes exactly one row and one `storyRequest.submit` outbox op with payload `{title,author,key}`; throwing inside the transaction stores neither; duplicate/in-library/empty add nothing; `listRequests` newest first; `markSent` sets `sentAt` and `updatedAt`.

- [x] 2.3 Form adapter + routing adapter [6]
  - Scenarios: story-request.submit.online (POST shape), story-request.submit.resync, story-request.submit.network-error, story-request.config.missing (adapter keeps op queued)
  - Files: src/sync/form-adapter.ts, tests/unit/form-adapter.test.ts
  - Test: npx vitest run tests/unit/form-adapter.test.ts tests/unit/sync-engine.test.ts
  - Done when: with a fake `fetchFn`, the POST URL is `https://docs.google.com/forms/d/e/test-form/formResponse`, init has `method:'POST'`, `mode:'no-cors'`, urlencoded content-type and body parsing (URLSearchParams) to `{ 'entry.111':'Phàm Nhân Tu Tiên','entry.222':'Vong Ngữ','entry.333':'pham nhan tu tien|vong ngu' }`; resolved → row `sentAt` set and op id in `ok`; rejected → op in `failed` and later ops untouched; cfg null → failed `form-not-configured`, no fetch; routing adapter sends `progress.upsert` to fallback and `storyRequest.submit` to the form adapter; with the real `createSyncEngine`, an op queued while offline (`setOnline(false)` from tests/setup) is POSTed exactly once after `setOnline(true)`.

## 3. UI

- [x] 3.1 Donate dialog [3]
  - Scenarios: donate.amount.preset, donate.amount.custom, donate.amount.invalid, donate.qr.copy, donate.download.png (component), donate.dialog.close
  - Files: src/donate/qr-png.ts, src/ui/donate/DonateDialog.tsx, tests/unit/donate-dialog.test.tsx
  - Test: npx vitest run tests/unit/donate-dialog.test.tsx
  - Done when: default radio `20k` checked and `[data-payload]` contains `540520000`; click `50k` → payload contains `540550000`, caption `50.000 ₫`; `Tuỳ chọn` + type `35000` → input value `35.000`, payload `540535000`; `500` → hint shown, no `[data-payload]`, download disabled; copy buttons call a stubbed `navigator.clipboard.writeText` with `0123456789` / the note and set the toast signal text; download calls injected `renderPng` then `save(blob,'ung-ho-50000.png')`; close button, Escape key and backdrop click each call `onClose`. Bank name, account name, number and note texts are visible.

- [x] 3.2 Donate banner + app shell + router [3, 7, 8]
  - Scenarios: donate.banner.shown, donate.banner.reader-hidden, donate.banner.config-missing, app-shell.routes.request
  - Files: src/ui/donate/DonateBanner.tsx, src/app.tsx, src/router.ts, tests/unit/app.test.tsx
  - Test: npx vitest run tests/unit/app.test.tsx tests/unit/icons.test.tsx
  - Done when: `parseHash('#/request')` → `{name:'request'}`; App with a donate config shows text `Ủng hộ token dịch truyện` and button `Ủng hộ` on library/settings/request routes, not on `read`; `donate={null}` → no banner; clicking `Ủng hộ` opens the dialog, closing returns focus to the button; nav order Thư viện, Yêu cầu, Cài đặt with `aria-current` on the active one; main has `pb-36` with banner, `pb-24` without.

- [x] 3.3 Request page [7]
  - Scenarios: story-request.form.required, story-request.normalize.no-accent-warning, story-request.dedup.device (message), story-request.dedup.library (link), story-request.submit.online (toast), story-request.submit.offline (toast + Chờ gửi), story-request.config.missing
  - Files: src/ui/request/RequestPage.tsx, tests/unit/request-page.test.tsx
  - Test: npx vitest run tests/unit/request-page.test.tsx
  - Done when: each listed message text appears exactly as in design §7; preview shows `Sẽ gửi: Phàm Nhân Tu Tiên Truyện — Vong Ngữ` while typing; no-accent title: first submit adds nothing and shows the warning, second submit saves; the library link sets `query` signal to the book title and hash `#/`; with an injected `flush` that marks the row sent → toast `Đã gửi yêu cầu` and badge `Đã gửi`; offline → toast `Đã lưu, sẽ gửi khi có mạng` and badge `Chờ gửi`; cfg null → notice and disabled submit.

- [x] 3.4 Wire main.tsx [6, 7, 8]
  - Scenarios: — (wiring; covered by e2e)
  - Files: src/main.tsx
  - Test: npm run build
  - Done when: engine built with the routing adapter; `pages.request` renders `RequestPage` with `services.db`, `getRequestFormConfig()` and `engine.flush`; `App` gets `donate={getDonateConfig()}`; build passes.

## 4. E2E and gates

- [x] 4.1 E2E donate + request [10]
  - Scenarios: donate.banner.shown, donate.layout.narrow, donate.layout.wide, donate.qr.offline, donate.download.png, story-request.layout.narrow, story-request.layout.wide, story-request.submit.online, story-request.submit.offline, story-request.submit.resync, app-shell.routes.request, app-shell.layout.narrow, app-shell.layout.wide
  - Files: playwright.config.ts (env only), tests/e2e/donate.spec.ts, tests/e2e/request.spec.ts, tests/e2e/icons.spec.ts (add `[data-banner], form` to `excluded`), tests/e2e/*.spec.ts only where existing assertions break because of the third nav item or banner (report each such change)
  - Test: npm run test:e2e
  - Done when: both projects pass; narrow: banner bottom edge == tab bar top edge (±1 px), `scrollWidth <= clientWidth`, the last library card's bottom ≤ banner top after scrolling to the end; wide: banner left ≥ side nav right; offline (context.setOffline) dialog still shows the QR svg and no request is made (`page.on('request')` count unchanged for non-local URLs); download event filename `ung-ho-50000.png`; request online → one intercepted POST with the expected body; offline submit → `Chờ gửi`, then `setOffline(false)` → one POST and `Đã gửi`.

- [x] 4.2 Coverage and gates
  - Files: none (report only)
  - Test: npx vitest run && npm run build && npm run test:e2e && npm run check:okf
  - Done when: all green; every scenario ID in this change's specs is found by `grep -r <id> tests/`.
