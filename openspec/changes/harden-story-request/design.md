# Design — harden-story-request

Vocabulary: /knowledge/domain/story-request.md, /knowledge/data/story-requests.md, decision 0007.
Archive order: `add-donate-and-story-request` must be archived first (this change MODIFIES its
`story-request` spec).

## 1. Key — `src/domain/request-text.ts`

```ts
/** Accent/case/punctuation-insensitive identity of a request: the title only. */
export function requestKey(title: string): string // = normalize(title)
```
The author parameter is removed; every caller passes the title only. Keys never contain `|`
any more, so old (`a|b`) and new keys cannot collide during migration.

## 2. Repo — `src/requests/request-repo.ts`

```ts
export const REQUEST_THROTTLE_MS = 10_000
export type SubmitResult = ... | { kind: 'too-soon'; waitSeconds: number }
export async function checkRequest(db, input, at = now()): Promise<CheckResult>
export async function submitRequest(db, input, at = now()): Promise<SubmitResult>
```
Order in `checkRequest`: empty → too-soon → in-library → duplicate → ok.
too-soon: `newest = await db.storyRequests.orderBy('createdAt').last()`;
`elapsed = at - newest.createdAt`; refused when `elapsed < REQUEST_THROTTLE_MS` with
`waitSeconds = Math.ceil((REQUEST_THROTTLE_MS - elapsed) / 1000)` (minimum 1).
`submitRequest` calls `checkRequest(db, input, at)` and, inside its transaction, re-checks
both the throttle (same rule, same `at`) and the duplicate key before writing. The row's
`createdAt` / `updatedAt` are `at`. Outbox payload `key` is the new key.

## 3. Dexie v5 — `src/db/db.ts`

Same stores as v4. `.upgrade(async (tx) => { ... })`:
1. `rows = await tx.table('storyRequests').orderBy('createdAt').toArray()` (oldest first).
2. `seen = new Set<string>()`. For each row: `k = requestKey(row.title)`.
   - If `seen.has(k)`: delete the row, and delete outbox rows where
     `type === 'storyRequest.submit' && entityId === row.id` (filter on `tx.table('outbox')`).
   - Else: `seen.add(k)`; update the row's `key` to `k`; update matching outbox ops'
     `payload.key` to `k`.
Update the `StoryRequest` doc comment (`key` is `requestKey(title)`).

## 4. Backup import — `src/data/backup.ts`

Before the unique-index guard, when `name === 'storyRequests'` and `typeof row.title === 'string'`,
set `row.key = requestKey(row.title)`. The existing guard then skips a row whose title exists
under another id.

## 5. UI — `src/ui/request/RequestPage.tsx`

- Message for `too-soon`: `Vui lòng đợi ${waitSeconds} giây rồi gửi tiếp` (in `role="alert"`
  like the others), both from `checkRequest` and from the post-check `submitRequest` result.
- Honeypot: state `website`. Markup, placed before the title field:
  ```html
  <div aria-hidden="true" class="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
    <label for="request-website">Website</label>
    <input id="request-website" name="website" type="text" tabIndex={-1} autoComplete="off" value=… onInput=…/>
  </div>
  ```
  The form gets `class="relative …"`. In `onSubmit`, first line after the `formConfig === null`
  guard: if `website.trim() !== ''` → clear all fields (incl. website), `setMessage(null)`,
  `showToast('Đã gửi yêu cầu')`, return. Nothing else runs.

## 6. Sheet script — `scripts/apps-script/dedupe-requests.gs`

Plain ES2019 (Apps Script V8), no imports. Constant `TITLE_HEADER = 'Tên truyện'`.
Pure helpers, exported for tests via `if (typeof module !== 'undefined') module.exports = {...}`:
- `normalizeTitle(s)` — same as `src/domain/title.ts` `normalize`.
- `duplicateRowIndexes(titles)` — `titles` is the title column without header; returns 0-based
  indexes to delete (empty normalised title, or normalised title seen earlier), ascending.
Apps Script entry points:
- `onFormSubmit(e)` — row = `e.range.getRow()`; read titles of rows 2..row; if the last one is
  empty or appears earlier → `sheet.deleteRow(row)`. Wrapped in `LockService.getScriptLock()`
  (`waitLock(30000)`) so concurrent submissions do not race.
- `dedupeAll()` — reads the whole column, deletes the indexes from `duplicateRowIndexes`
  bottom-up (`deleteRow(i + 2)`), under the same lock.
- `findTitleColumn(sheet)` — 1-based column whose row-1 header equals `TITLE_HEADER`; throws if missing.

Deleting rows in the linked Sheet does not delete responses inside the Form itself
(the Form's own Responses tab keeps them); this is documented in the playbook.

## 7. Tests

| Scenario | Test file |
|---|---|
| dedup.device, dedup.library, dedup.title-unique, throttle.too-soon, throttle.after-window, throttle.offline | tests/unit/request-repo.test.ts |
| dedup.migrate | tests/unit/db.v5.test.ts |
| dedup.import-old-backup | tests/unit/db.v5.test.ts |
| honeypot.filled, throttle.too-soon (message) | tests/unit/request-page.test.tsx |
| honeypot.hidden | tests/e2e/request.spec.ts |
| sheet.dedupe-new, sheet.dedupe-all | tests/unit/sheet-dedupe.test.ts |
