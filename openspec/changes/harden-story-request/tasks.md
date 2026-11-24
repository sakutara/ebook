# Tasks — harden-story-request

Rules for every task: strict TDD (failing run first, then passing full suite). Test names
start with the scenario ID. Do not edit `openspec/**`, `knowledge/**` or `src/ui/icons/svg/*`.
Design reference: `design.md` section numbers in brackets. Full suite: `npx vitest run`.

## 1. Domain and data

- [x] 1.1 Title-only key + throttle in repo [1][2]
  - Scenarios: story-request.dedup.device, story-request.dedup.library, story-request.dedup.title-unique, story-request.throttle.too-soon, story-request.throttle.after-window, story-request.throttle.offline
  - Files: src/domain/request-text.ts, src/requests/request-repo.ts, tests/unit/request-text.test.ts, tests/unit/request-repo.test.ts
  - Test: npx vitest run tests/unit/request-text.test.ts tests/unit/request-repo.test.ts
  - Done when: `requestKey('Phàm Nhân Tu Tiên')==='pham nhan tu tien'`; the old `dedup.author-differs` test is replaced by `dedup.title-unique` (`Tam Quốc`/`La Quán Trung` then `tam quoc`/'' and `tam quoc`/`Khác` → duplicate); existing tests that save several requests pass increasing `at` values ≥10 000 ms apart; `submitRequest(db,x,1000)` then `submitRequest(db,y,4000)` → `{kind:'too-soon',waitSeconds:7}` with row and outbox counts unchanged; at 11000 → saved; `checkRequest` with empty title returns `empty` even inside the window; offline (no fetch involved) gives the same result.

- [x] 1.2 Dexie v5 re-key migration + import re-key [3][4]
  - Scenarios: story-request.dedup.migrate, story-request.dedup.import-old-backup
  - Files: src/db/db.ts, src/data/backup.ts, tests/unit/db.v5.test.ts
  - Test: npx vitest run tests/unit/db.v5.test.ts tests/unit/db.v4.test.ts tests/unit/db.v3.test.ts
  - Done when: a v4 DB (open with a raw Dexie at version 4, same stores) holding `Tam Quốc|La Quán Trung` (createdAt 1) and `Tam Quốc|` (createdAt 2, with an outbox op for it) plus `Đấu Phá|` (createdAt 3, with an outbox op), reopened as AppDB: 2 rows, keys `tam quoc` and `dau pha`, the createdAt-2 row and its op gone, `Đấu Phá`'s op payload.key `dau pha`. Importing a backup with rows `{key:'tam quoc|x', title:'Tam Quốc', id:'new'}` and `{key:'kiem lai|', title:'Kiếm Lai', id:'k'}` into that DB: Tam Quốc skipped, Kiếm Lai stored with key `kiem lai`.

## 2. UI

- [x] 2.1 Throttle message + honeypot on RequestPage [5]
  - Scenarios: story-request.throttle.too-soon (UI), story-request.honeypot.filled
  - Files: src/ui/request/RequestPage.tsx, tests/unit/request-page.test.tsx
  - Test: npx vitest run tests/unit/request-page.test.tsx
  - Done when: submitting twice within 10 s (second title different; use `vi.setSystemTime` or rows with recent createdAt) shows "Vui lòng đợi N giây rồi gửi tiếp" and the list has one row; filling `#request-website` then submitting a valid title shows the toast "Đã gửi yêu cầu", fields are cleared, `storyRequests` and `outbox` are empty, and `flush` was not called. Existing tests still pass (adjust any that submit twice back-to-back by seeding older createdAt).

- [x] 2.2 E2E: honeypot not focusable or visible [5]
  - Scenarios: story-request.honeypot.hidden
  - Files: tests/e2e/request.spec.ts
  - Test: npx playwright test tests/e2e/request.spec.ts
  - Done when: at 360×800 and 1280×800, pressing Tab repeatedly from the title field through the submit button never focuses `#request-website`; its bounding box is off-screen (x+width ≤ 0) or 1×1.

## 3. Sheet script

- [x] 3.1 Apps Script dedupe [6]
  - Scenarios: story-request.sheet.dedupe-new, story-request.sheet.dedupe-all
  - Files: scripts/apps-script/dedupe-requests.gs, tests/unit/sheet-dedupe.test.ts
  - Test: npx vitest run tests/unit/sheet-dedupe.test.ts
  - Done when: the test loads the .gs with `fs.readFileSync` + `new Function('module', src)(mod)`; `normalizeTitle` matches `normalize` from src/domain/title.ts on `'Phàm Nhân Tu Tiên!'`, `'Đấu  Phá'`, `''`; `duplicateRowIndexes(['A','B','a','','b!','C'])` → `[2,3,4]`; with a fake sheet (getRange/getValues/deleteRow recorded, header row `['Dấu thời gian','Tên truyện']`) and fake `LockService`, `onFormSubmit({range:{getRow:()=>5}})` on titles `['Phàm Nhân Tu Tiên','X','Y','pham nhan tu tien!']` calls `deleteRow(5)` once, and on a unique title calls nothing; `dedupeAll()` deletes rows 6,5,4 in that order (bottom-up) for the 6-title case.

## 4. Knowledge (Opus)

- [x] 4.1 Update knowledge/domain/story-request.md, knowledge/data/story-requests.md (v5), decision 0007 (spam: honeypot + throttle + Sheet dedupe), new knowledge/playbooks/sheet-dedupe.md, knowledge/log.md.
