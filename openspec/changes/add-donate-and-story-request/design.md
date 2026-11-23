# Design — add-donate-and-story-request

Vocabulary: /knowledge/domain/donation.md, /knowledge/domain/story-request.md,
/knowledge/data/story-requests.md, decision 0007. This file says *how*.

## 1. Configuration — `src/config.ts` (+ `src/vite-env.d.ts`, `.env.example`)

```ts
export interface DonateConfig { bin: string; bankName: string; accountNo: string; accountName: string; note: string }
/** null when bank/accountNo/accountName is empty or bank is unknown. accountNo: digits only (strip spaces/dots). */
export function getDonateConfig(env = import.meta.env): DonateConfig | null
export interface RequestFormConfig { formId: string; entryTitle: string; entryAuthor: string; entryKey?: string }
/** null when formId or entryTitle is empty. entryAuthor may be ''; entryKey undefined when empty. Entry ids accept '123' or 'entry.123'. */
export function getRequestFormConfig(env = import.meta.env): RequestFormConfig | null
```

`.env.example` adds, with comments: `VITE_DONATE_BANK=` (VCB / Vietcombank / 970436),
`VITE_DONATE_ACCOUNT_NO=`, `VITE_DONATE_ACCOUNT_NAME=`, `VITE_DONATE_NOTE=` (default
`donate token dich truyen`), `VITE_REQUEST_FORM_ID=` (the `1FAIpQL…` id from the form's
`/d/e/<id>/viewform` URL), `VITE_REQUEST_ENTRY_TITLE=`, `VITE_REQUEST_ENTRY_AUTHOR=`,
`VITE_REQUEST_ENTRY_KEY=` (entry ids: Form ⋮ → "Get pre-filled link", fill, copy link, read `entry.<n>`).

## 2. Donate domain (pure) — `src/donate/`

`banks.ts`
```ts
export interface Bank { bin: string; code: string; name: string; aliases: string[] }
export const BANKS: Bank[]
/** Case/accent/space-insensitive match on bin, code, name or alias (use normalize() from domain/title). */
export function resolveBank(input: string): Bank | null
```
Table (bin · code · display name · extra aliases):
970436 VCB Vietcombank · 970407 TCB Techcombank · 970422 MB MBBank (mbbank, mb bank, quan doi) ·
970418 BIDV BIDV · 970415 ICB VietinBank (ctg, vietin) · 970405 VBA Agribank · 970416 ACB ACB ·
970432 VPB VPBank · 970423 TPB TPBank · 970403 STB Sacombank · 970441 VIB VIB · 970443 SHB SHB ·
970437 HDB HDBank · 970448 OCB OCB · 970426 MSB MSB (maritime) · 970440 SEAB SeABank ·
970431 EIB Eximbank · 970449 LPB LPBank (lienvietpostbank) · 970428 NAB Nam A Bank ·
970454 VCCB BVBank (viet capital) · 970412 PVCB PVcomBank · 970429 SCB SCB · 970425 ABB ABBANK ·
970409 BAB Bac A Bank · 970427 VAB VietABank · 970452 KLB KienlongBank · 970419 NCB NCB ·
970400 SGICB Saigonbank · 963388 TIMO Timo · 546034 CAKE CAKE · 546035 UBANK Ubank.

`vietqr.ts`
```ts
export const DEFAULT_NOTE = 'donate token dich truyen'
/** ASCII-fold (NFD, drop marks, đ→d), keep [A-Za-z0-9 ], collapse spaces, trim, cut to 25, trim again; '' → DEFAULT_NOTE. */
export function cleanNote(raw: string | undefined): string
export function crc16(s: string): string // CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 uppercase hex
export function buildVietQr(p: { bin: string; accountNo: string; amount: number; note: string }): string
export const MIN_AMOUNT = 1000, MAX_AMOUNT = 50_000_000
export const PRESETS = [10000, 20000, 50000, 100000]
export function formatVnd(n: number): string // 50000 → '50.000' (dot groups, no locale dependency)
export function parseAmount(text: string): number | null // strip non-digits; null if empty or outside [MIN, MAX]
```
TLV helper `tlv(id, value) = id + len(value).padStart(2,'0') + value`. Payload =
`tlv('00','01') + tlv('01','12') + tlv('38', tlv('00','A000000727') + tlv('01', tlv('00',bin)+tlv('01',accountNo)) + tlv('02','QRIBFTTA')) + tlv('53','704') + tlv('54', String(amount)) + tlv('58','VN') + tlv('62', tlv('08', note)) + '6304'`, then append `crc16(payload)`.
Test vector: `crc16('123456789') === '29B1'`.

`qr-matrix.ts` — wraps `qrcode-generator` (new dependency, `npm i qrcode-generator`):
```ts
/** typeNumber 0 (auto), error level 'M'. Returns modules[row][col] booleans. */
export function qrMatrix(text: string): boolean[][]
/** One <path> with a 'M x y h1v1h-1z' run per dark module, viewBox incl. 4-module quiet zone. */
export function qrSvg(text: string): string
```

`qr-png.ts` (browser-only, not unit-tested beyond the filename; jsdom has no canvas):
```ts
export function pngFileName(amount: number): string // `ung-ho-${amount}.png`
/** 720×1000 canvas, white bg, dark #111: heading 'Ủng hộ token dịch truyện', QR 600 px centred, then
 *  '<formatVnd> ₫', bank name, account name, account no, 'Nội dung: <note>'. Returns canvas.toBlob('image/png'). */
export async function renderQrPng(p: { payload: string; amount: number; cfg: DonateConfig }): Promise<Blob>
export function saveBlob(blob: Blob, name: string): void // <a download> + object URL, as in SettingsPage.onExport
```

## 3. Donate UI — `src/ui/donate/`

`DonateBanner.tsx` — `({ config }: { config: DonateConfig | null })`; renders null when
`config` is null. Markup: `<aside data-banner aria-label="Ủng hộ" class="flex items-center justify-between gap-2 border-t border-surface-2 bg-surface-2 px-gutter py-1.5">`,
text `Ủng hộ token dịch truyện` (`text-fluid-sm`), `IconTextButton icon="donate" label="Ủng hộ" variant="primary"`.
Holds `open` state and renders `DonateDialog`; on close focuses the button again (ref).

`DonateDialog.tsx` — props `{ config, onClose, renderPng?, save? }` (last two injectable for tests;
defaults from qr-png.ts). Same `<dialog open role="dialog" aria-modal="true">` pattern as
`ConfirmDialog` in SettingsPage, plus a full-screen backdrop `div` (click → onClose) and a
`keydown` Escape listener on `document`. Content top→bottom:
1. Title "Ủng hộ token dịch truyện"; `IconButton icon="close" label="Đóng"` top-right.
2. `div role="radiogroup" aria-label="Số tiền"` with 5 radio buttons (plain text, `role="radio"`,
   `aria-checked`): `10k`, `20k`, `50k`, `100k`, `Tuỳ chọn`. Default 20k. 3-col grid on narrow, 5-col from `sm`.
3. When "Tuỳ chọn": `<input inputMode="numeric" aria-label="Số tiền tuỳ chọn">`; on input, keep digits
   and display `formatVnd`; invalid → hint `Từ 1.000 đến 50.000.000 ₫` (`role="alert"`), no QR.
4. QR: `<div aria-label="Mã QR chuyển khoản" role="img" data-payload={payload}>` with `qrSvg(payload)`
   inline (`dangerouslySetInnerHTML`), size `min(70vw, 18rem)`, white background + padding.
   Caption `<formatVnd> ₫`.
5. Rows: Ngân hàng — bankName; Chủ tài khoản — accountName; Số tài khoản — accountNo +
   `IconButton icon="copy" label="Sao chép số tài khoản"`; Nội dung — note +
   `IconButton icon="copy" label="Sao chép nội dung"`. Copy → `navigator.clipboard.writeText`
   then `showToast('Đã sao chép số tài khoản' | 'Đã sao chép nội dung')`.
6. `IconTextButton icon="download" label="Tải mã QR" variant="primary"` (disabled when invalid) →
   `save(await renderPng({payload, amount, cfg}), pngFileName(amount))`.
Width `w-[min(92vw,26rem)]`, `max-h-[90dvh] overflow-y-auto`.

## 4. Story request domain (pure) — `src/domain/request-text.ts`

```ts
/** NFC, drop \p{Cc}\p{Cf}, collapse \s+, trim; strip leading ["'“”‘’«»]+ and trailing ["'“”‘’«».,!?;:…~]+ (repeat until stable);
 *  if it starts with one of ([{ and ends with the matching )]} strip both; trim. */
export function cleanText(raw: string): string
/** Title-case each space-separated word and each hyphen part: first \p{L} → toLocaleUpperCase('vi'),
 *  remaining letters → toLocaleLowerCase('vi'). Words matching /^(ii|iii|iv|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/i → uppercase. */
export function titleCaseVi(s: string): string
export function normalizeRequestText(raw: string): string // titleCaseVi(cleanText(raw))
export function requestKey(title: string, author: string): string // `${normalize(title)}|${normalize(author)}`
/** true when s has a letter and no char > U+007F. */
export function lacksDiacritics(s: string): boolean
```
`normalize` is the existing `src/domain/title.ts` function.

## 5. Data — Dexie v3 (`src/db/db.ts`)

```ts
export interface StoryRequest { id: string; key: string; title: string; author: string;
  createdAt: number; sentAt: number | null; updatedAt: number; deleted: 0 }
```
`this.version(3).stores({ ...v2 stores, storyRequests: 'id, &key, createdAt' })` (v1/v2 blocks
untouched, no upgrade fn). Add `storyRequests!: EntityTable<StoryRequest, 'id'>`.

`src/data/backup.ts` `importData`: before `put`, for each unique index of the table
(`table.schema.indexes.filter(i => i.unique)`), skip the row if a row with the same index value
and a different primary key exists (prevents a ConstraintError aborting the whole import).

`src/requests/request-repo.ts`
```ts
export type SubmitResult =
  | { kind: 'saved'; request: StoryRequest }
  | { kind: 'empty' }
  | { kind: 'duplicate'; existing: StoryRequest }
  | { kind: 'in-library'; bookTitle: string }
export async function submitRequest(db: AppDB, input: { title: string; author: string }): Promise<SubmitResult>
export function listRequests(db: AppDB): Promise<StoryRequest[]> // createdAt desc
export async function markSent(db: AppDB, id: string, at = Date.now()): Promise<void>
```
`submitRequest`: title = normalizeRequestText; `normalize(title) === ''` → empty. Library check:
`db.books.where('normTitle').equals(normalize(title)).first()` → in-library. Then in one
`db.transaction('rw', db.storyRequests, db.outbox)`: key lookup → duplicate; else add row
(`sentAt: null`, `deleted: 0`) and `enqueue(db, { type: 'storyRequest.submit', entity: 'storyRequests', entityId: id, payload: { title, author, key } })`.

## 6. Delivery — `src/sync/form-adapter.ts`

```ts
export function createFormAdapter(db: AppDB, cfg: RequestFormConfig | null, fetchFn = fetch): SyncAdapter
/** Routes ops by type; unknown types go to fallback (localOnlyAdapter). Merges results. */
export function createRoutingAdapter(routes: Record<string, SyncAdapter>, fallback: SyncAdapter): SyncAdapter
```
Form adapter `push(ops)`: sequentially per op; cfg null → failed `'form-not-configured'`.
`fetchFn(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })`
with fields `entry.<entryTitle>`=title, `entry.<entryAuthor>`=author (only if entryAuthor set),
`entry.<entryKey>`=key (only if set). Resolve → `markSent` → ok. Reject → failed with message;
stop processing the rest of the batch (remaining ops reported neither ok nor failed stay queued).

`src/main.tsx`: `const engine = createSyncEngine(db, createRoutingAdapter({ 'storyRequest.submit': createFormAdapter(db, getRequestFormConfig()) }, localOnlyAdapter))`.

## 7. Request UI — `src/ui/request/RequestPage.tsx`, route `#/request`

Props `{ db: AppDB; formConfig: RequestFormConfig | null; flush: () => Promise<void> }`.
- `cfg null` → notice `Chưa cấu hình Google Form` (`role="status"`), submit disabled.
- `<form>`: label "Tên truyện" input (`maxLength 200`, required), label "Tác giả" input (`maxLength 100`),
  preview `<p aria-live="polite">Sẽ gửi: {title}{author ? ' — ' + author : ''}</p>` when title non-empty,
  submit `IconTextButton type="submit" icon="send" label="Gửi yêu cầu" variant="primary"`.
- Messages under the form (`role="alert"`): empty → `Nhập tên truyện`; no-accent → `Tên truyện chưa có dấu — hãy gõ tiếng Việt có dấu`
  (first submit only shows it and sets `confirmedNoAccent`; editing the title resets it);
  duplicate → `Bạn đã yêu cầu truyện này`; in-library → `Truyện đã có trong thư viện` + link
  `Xem trong thư viện` (`onClick`: `query.value = bookTitle; navigate('#/')`).
- Saved → clear inputs; `if (navigator.onLine) await flush()`; re-read the row: `sentAt` →
  toast `Đã gửi yêu cầu`; offline → `Đã lưu, sẽ gửi khi có mạng`; online but unsent → `Đã lưu, sẽ thử gửi lại`.
- List "Đã yêu cầu" (`<section aria-label="Đã yêu cầu">`, live query): title, author, badge `Đã gửi` / `Chờ gửi`.
- Layout: `flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,40rem)_1fr]`.

Router: `Route` gains `{ name: 'request' }`, `parseHash('#/request')`. App `NAV` order: Thư viện,
Yêu cầu (`icon: 'request'`), Cài đặt. `Pages` gains `request`.

## 8. App shell

`App` takes `donate?: DonateConfig | null` prop (main passes `getDonateConfig()`). Non-reader
layout: bottom stack `div class="fixed inset-x-0 bottom-0 z-10 lg:sticky lg:inset-x-auto"`
containing `<DonateBanner>` then the existing bottom `nav` (which loses its own `fixed` classes,
keeps `lg:hidden`). `main` padding `pb-36` when banner shown (else `pb-24`), `lg:pb-8` unchanged.
Update-available alert `bottom-20` → `bottom-36` when banner shown. Reader route unchanged.

## 9. Icons (drawn by the architect, `src/ui/icons/svg/`)

| icon | drawing | used for | form |
|---|---|---|---|
| donate | heart over an open hand / coin | Ủng hộ (banner) | icon + text |
| copy | two offset sheets | Sao chép số tài khoản / nội dung | icon only |
| send | paper plane | Gửi yêu cầu | icon + text (form submit) |
| request | book with a plus badge | Yêu cầu (nav) | icon + label |

`ICON_NAMES` gains the 4 names. e2e icon audit excludes `[data-banner]` and `form` (their
buttons are labelled exceptions). knowledge/ui/icons.md table updated.

## 10. Test plan

| scenario(s) | test |
|---|---|
| donate.qr.payload, donate.note.* | tests/unit/vietqr.test.ts |
| donate.qr.bank-alias, donate.banner.config-missing (config part) | tests/unit/donate-config.test.ts |
| donate.amount.*, donate.qr.copy, donate.download.png, donate.dialog.close | tests/unit/donate-dialog.test.tsx |
| donate.banner.shown/reader-hidden/config-missing | tests/unit/app.test.tsx |
| donate.layout.*, donate.qr.offline, donate.download.png (real file) | tests/e2e/donate.spec.ts |
| story-request.normalize.* | tests/unit/request-text.test.ts |
| story-request.dedup.*, story-request.backup.roundtrip, submit.offline (data) | tests/unit/request-repo.test.ts |
| story-request.submit.online/resync/network-error, config.missing (adapter) | tests/unit/form-adapter.test.ts |
| story-request.form.*, normalize.no-accent-warning, dedup.library (link), submit.* toasts, config.missing | tests/unit/request-page.test.tsx |
| story-request.layout.*, submit.offline→resync end-to-end, app-shell.routes.request, app-shell.layout.* | tests/e2e/request.spec.ts |

E2E: `playwright.config.ts` webServer env adds `VITE_DONATE_BANK=VCB`, `VITE_DONATE_ACCOUNT_NO=0123456789`,
`VITE_DONATE_ACCOUNT_NAME=NGUYEN VAN A`, `VITE_REQUEST_FORM_ID=test-form`, `VITE_REQUEST_ENTRY_TITLE=111`,
`VITE_REQUEST_ENTRY_AUTHOR=222`, `VITE_REQUEST_ENTRY_KEY=333`; tests intercept
`https://docs.google.com/forms/**` with `page.route` and record request bodies.
