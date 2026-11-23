import { test, expect, type Page } from '@playwright/test'
import { mockDrive, type DriveMockController, type MockFile } from './drive-mock'
import {
  BOOK_ID,
  TITLE,
  backToLibrary,
  bookCard,
  chapterOf,
  goToTocEntry,
  marker,
  markerKey,
  openBook,
  openFromLibrary,
  percent,
  pressNext,
} from './reader-helpers'

type Version = Pick<MockFile, 'fixture' | 'md5' | 'modifiedTime'>

const V1: Version = { fixture: 'book-v1.epub', md5: 'm1', modifiedTime: '2026-11-01T00:00:00.000Z' }
const V2: Version = { fixture: 'book-v2.epub', md5: 'm2', modifiedTime: '2026-11-10T00:00:00.000Z' }
const V3: Version = { fixture: 'book-v3.epub', md5: 'm3', modifiedTime: '2026-11-10T00:00:00.000Z' }
const V4: Version = { fixture: 'book-v4.epub', md5: 'm4', modifiedTime: '2026-11-10T00:00:00.000Z' }

const FILE_NAME = 'Sách Mẫu.epub'
const REFRESH = { name: 'Làm mới', exact: true } as const
const STALE_BADGE = 'Có bản mới'
const CACHED_BADGE = 'Đã lưu'
const LOCAL_ONLY_BADGE = 'Chỉ còn trên máy'
const OLD_COPY_TOAST = 'Đang đọc bản cũ — sẽ cập nhật khi có mạng'

function sachMau(version: Version, extra: Partial<MockFile> = {}): MockFile[] {
  return [{ id: BOOK_ID, name: FILE_NAME, ...version, ...extra }]
}

/**
 * Chapter 5 from the TOC, then ArrowRight until the page starts at paragraph 15 or later
 * (at most 30 presses). Returns that paragraph number.
 */
async function readChapter5ToParagraph15(page: Page): Promise<number> {
  await goToTocEntry(page, 'Chương 5')
  await expect.poll(() => chapterOf(page)).toBe(5)
  for (let press = 0; ; press++) {
    const m = await marker(page)
    if (m && m.chapter === 5 && m.kind === 'P' && m.para >= 15) return m.para
    if (press === 30) throw new Error('chapter 5 paragraph 15 not reached within 30 presses')
    await pressNext(page)
  }
}

/** Gives the 1 s debounced save time to land, then leaves the reader through its back button. */
async function leaveReader(page: Page): Promise<void> {
  await page.waitForTimeout(1500)
  await backToLibrary(page)
}

/**
 * Taps "Làm mới" and waits until the catalog has seen the new version (a download of the book
 * has started). Optionally waits for that download to finish.
 */
async function refreshCatalog(page: Page, drive: DriveMockController, { waitForDownload = true } = {}): Promise<void> {
  const before = drive.fullMediaRequests(BOOK_ID)
  await page.getByRole('button', REFRESH).click()
  await expect.poll(() => drive.fullMediaRequests(BOOK_ID)).toBeGreaterThan(before)
  if (waitForDownload) await expect(bookCard(page)).toContainText(CACHED_BADGE)
}

test.describe('resume', () => {
  test('progress.resume.same-version: reopening after a reload resumes at the same paragraph', async ({ page, context }) => {
    await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    const para = await readChapter5ToParagraph15(page)
    await leaveReader(page)

    await page.reload()
    await openBook(page)
    await expect.poll(() => markerKey(page)).toBe(`C5P${para}`)
  })

  test('progress.resume.after-refresh: after a v2 with one paragraph inserted, the same paragraph is shown', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    const para = await readChapter5ToParagraph15(page)
    const M = `C5P${para}`
    await leaveReader(page)

    drive.setFiles(sachMau(V2))
    await refreshCatalog(page, drive)

    await openBook(page)
    await expect.poll(() => markerKey(page)).toBe(M)
    expect(drive.fullMediaRequests(BOOK_ID)).toBeGreaterThanOrEqual(2)

    await leaveReader(page)
    await openBook(page)
    await expect.poll(() => markerKey(page)).toBe(M)
  })

  test('progress.resume.ambiguous-snippet: a page starting mid-paragraph in repeated text resumes exactly after a v2 refresh', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    await readChapter5ToParagraph15(page)
    // One more page: the new page starts mid-paragraph, where the filler text repeats in every paragraph.
    await pressNext(page)
    const M = await markerKey(page)
    expect(M).not.toBeNull()
    await leaveReader(page)

    drive.setFiles(sachMau(V2))
    await refreshCatalog(page, drive)

    await openBook(page)
    await expect.poll(() => markerKey(page)).toBe(M)
  })

  test('progress.resume.snippet-gone: when chapter 5 is rewritten, the same chapter and nearby paragraph are shown', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    const para = await readChapter5ToParagraph15(page)
    await leaveReader(page)

    drive.setFiles(sachMau(V3))
    await refreshCatalog(page, drive)

    await openBook(page)
    await expect.poll(() => marker(page)).toMatchObject({ chapter: 5, kind: 'R' })
    const landed = await marker(page)
    expect(landed?.kind).toBe('R')
    expect(Math.abs((landed?.para ?? Number.NaN) - para)).toBeLessThanOrEqual(6)
  })

  test('progress.resume.section-gone: when chapter 5 is removed, the reading percentage stays within 5 points', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    await readChapter5ToParagraph15(page)
    const before = await percent(page)
    await leaveReader(page)

    drive.setFiles(sachMau(V4))
    await refreshCatalog(page, drive)

    await openBook(page)
    const after = await percent(page)
    expect(Math.abs(after - before)).toBeLessThanOrEqual(5)
  })

  test('progress.resume.after-cache-clear: the position survives deleting the cached copy', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    const para = await readChapter5ToParagraph15(page)
    await leaveReader(page)

    await page.getByRole('link', { name: 'Cài đặt' }).filter({ visible: true }).click()
    const clear = page
      .getByRole('button', { name: `Xoá bản lưu: ${TITLE}`, exact: true })
      .filter({ visible: true })
    await clear.click()
    await expect(clear).toHaveCount(0)

    const before = drive.fullMediaRequests(BOOK_ID)
    await openFromLibrary(page)
    await expect.poll(() => markerKey(page)).toBe(`C5P${para}`)
    expect(drive.fullMediaRequests(BOOK_ID)).toBe(before + 1)
  })

  test('progress.resume.reuploaded: a file re-uploaded under a new id resumes at the same paragraph', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    const para = await readChapter5ToParagraph15(page)
    await leaveReader(page)

    drive.setFiles([{ id: 'b2', name: FILE_NAME, ...V1, md5: 'm1b' }])
    await page.getByRole('button', REFRESH).click()
    // b2 is listed, and b1 (still cached) is now local-only.
    await expect(bookCard(page)).toHaveCount(2)
    await expect(bookCard(page).filter({ hasText: LOCAL_ONLY_BADGE })).toHaveCount(1)

    const reuploaded = bookCard(page).filter({ hasNotText: LOCAL_ONLY_BADGE })
    await openBook(page, reuploaded, 'b2')
    await expect.poll(() => markerKey(page)).toBe(`C5P${para}`)
  })

  test('cache.stale.open-online: opening right after the catalog sees v2 shows the new chapter 5', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    await expect.poll(() => markerKey(page)).not.toBeNull()
    await backToLibrary(page)

    drive.setFiles(sachMau(V2))
    // Do not wait for the background re-download: opening must fetch v2 itself if needed.
    await refreshCatalog(page, drive, { waitForDownload: false })

    await openBook(page)
    await goToTocEntry(page, 'Chương 5')
    await expect.poll(() => markerKey(page)).toBe('C5P0')
  })

  test('cache.stale.offline: with a stale copy and no network the old copy opens with a notice', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    await expect.poll(() => markerKey(page)).not.toBeNull()
    await backToLibrary(page)

    // Holds the v2 download so the copy stays stale while the network goes away.
    drive.setFiles(sachMau(V2, { delayMs: 5000 }))
    await refreshCatalog(page, drive, { waitForDownload: false })
    await expect(bookCard(page)).toContainText(STALE_BADGE)

    await context.setOffline(true)
    await openBook(page)
    await expect(page.getByText(OLD_COPY_TOAST)).toBeVisible()
    await goToTocEntry(page, 'Chương 5')
    await expect.poll(() => markerKey(page)).toBe('C5P1')
  })

  test('cache.persist.removed-from-drive: a cached book that left Drive still opens', async ({ page, context }) => {
    const drive = await mockDrive(context, sachMau(V1))
    await openFromLibrary(page)
    await expect.poll(() => markerKey(page)).not.toBeNull()
    await backToLibrary(page)

    const before = drive.fullMediaRequests(BOOK_ID)
    drive.setFiles([])
    await page.getByRole('button', REFRESH).click()
    await expect(bookCard(page).getByText(LOCAL_ONLY_BADGE)).toBeVisible()

    await openBook(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    expect(drive.fullMediaRequests(BOOK_ID)).toBe(before)
    expect(await chapterOf(page)).toBe(1)
  })
})
