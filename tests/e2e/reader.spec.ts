import { test, expect } from '@playwright/test'
import { epubPath, mockR2 } from './r2-mock'
import {
  BOOK_ID,
  TITLE,
  backButton,
  chapterOf,
  frameStyle,
  goToTocEntry,
  marker,
  openFromLibrary,
  percent,
  showChrome,
  tapTextArea,
  waitForReady,
} from './reader-helpers'

const FILES = [{ id: BOOK_ID, title: TITLE, fixture: 'book-v1.epub' }]

test.describe('reader', () => {
  test('cache.fetch.first-read: first open downloads the book once; reopening makes no full media request', async ({ page, context }) => {
    const r2 = await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
    expect(r2.count(epubPath(BOOK_ID))).toBe(1)

    await showChrome(page)
    await page.getByRole('button', { name: 'Về thư viện' }).click()
    await expect(page).toHaveURL(/\/(#\/)?$/)
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
    expect(r2.count(epubPath(BOOK_ID))).toBe(1)
  })

  test('reader.open.cached: second open renders without any full media request', async ({ page, context }) => {
    const r2 = await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    const before = r2.count(epubPath(BOOK_ID))

    await page.goto('./#/')
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    expect(r2.count(epubPath(BOOK_ID))).toBe(before)
  })

  test('reader.open.offline: a cached book renders with the network down', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    await page.evaluate(() => navigator.serviceWorker.ready)

    await context.setOffline(true)
    await page.reload()
    await waitForReady(page)
    await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
  })

  test('reader.nav.tap: tapping the right 85 % advances the page without losing progress', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    const startMarker = await marker(page)
    const startPct = await percent(page)

    await tapTextArea(page, 0.85)
    await expect.poll(async () => JSON.stringify(await marker(page))).not.toBe(JSON.stringify(startMarker))
    expect(await percent(page)).toBeGreaterThanOrEqual(startPct)
  })

  test('reader.nav.keys: ArrowRight advances to the next page', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    const startMarker = await marker(page)

    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => JSON.stringify(await marker(page))).not.toBe(JSON.stringify(startMarker))
  })

  test('reader.nav.slider: seeking to the middle of the book lands in chapter 5 or 6', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    await showChrome(page)

    const slider = page.getByRole('slider', { name: 'Vị trí trong truyện' })
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '500'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect.poll(async () => (await percent(page))).toBeGreaterThanOrEqual(45)
    expect(await percent(page)).toBeLessThanOrEqual(55)
    await expect.poll(() => chapterOf(page)).toBeGreaterThanOrEqual(5)
    expect([5, 6]).toContain(await chapterOf(page))
  })

  test('reader.chrome.toggle: a centre tap shows the chrome and a second one hides it', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    const slider = page.getByRole('slider', { name: 'Vị trí trong truyện' })
    await expect(slider).toBeHidden()
    // The way back stays on screen (faint) while the controls are hidden.
    await expect(backButton(page)).toBeVisible()

    await tapTextArea(page, 0.5)
    await expect(slider).toBeVisible()
    await tapTextArea(page, 0.5)
    await expect(slider).toBeHidden()
  })

  test('reader.toc.go: choosing "Chương 5" in the table of contents opens chapter 5', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()

    await goToTocEntry(page, 'Chương 5')
    await expect.poll(() => chapterOf(page)).toBe(5)
  })

  test('reader.layout.narrow: at 375 px no navigation landmarks show and the TOC is a full-screen sheet', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()

    await expect(page.getByRole('navigation').filter({ visible: true })).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: 'Mục lục' })).toBeHidden()

    await showChrome(page)
    await page.getByRole('button', { name: 'Mục lục', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Mục lục' })
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    const vp = page.viewportSize()
    if (!box || !vp) throw new Error('sheet or viewport missing')
    expect(Math.abs(box.width - vp.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(box.height - vp.height)).toBeLessThanOrEqual(2)
  })

  test('reader.layout.wide: at 1280 px the TOC aside sits beside a text column of at most 40 rem', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()

    const aside = page.getByRole('complementary', { name: 'Mục lục' })
    await expect(aside).toBeVisible()
    const asideBox = await aside.boundingBox()
    const textBox = await page.locator('foliate-view').boundingBox()
    if (!asideBox || !textBox) throw new Error('aside or text area missing')
    expect(asideBox.x + asideBox.width).toBeLessThanOrEqual(textBox.x + 1)

    // body is laid out as a multi-column strip, so measure the visible paragraphs' column width.
    const paragraphWidths = await page.evaluate(() => {
      const view = document.querySelector('foliate-view') as unknown as {
        renderer: { getContents(): { doc: Document }[] }
      }
      const doc = view.renderer.getContents()[0].doc
      return [...doc.querySelectorAll('p')].slice(0, 5).map((p) => p.getBoundingClientRect().width)
    })
    expect(paragraphWidths.length).toBeGreaterThan(0)
    for (const w of paragraphWidths) expect(w).toBeLessThanOrEqual(640 + 1)
    const maxInline = await page.evaluate(() => {
      const view = document.querySelector('foliate-view') as unknown as { renderer: Element }
      return view.renderer.getAttribute('max-inline-size')
    })
    expect(maxInline).toBe('40rem')
  })

  test('reader.toc.collapse: hiding the side panel widens the text area, survives reload and can be undone', async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await goToTocEntry(page, 'Chương 5')
    await expect.poll(() => chapterOf(page)).toBe(5)

    const aside = page.getByRole('complementary', { name: 'Mục lục' })
    const textArea = page.locator('foliate-view')
    await page.getByRole('button', { name: 'Đóng mục lục', exact: true }).click()
    await expect(aside).toBeHidden()
    await expect.poll(async () => (await textArea.boundingBox())?.width).toBe(1280)
    await expect.poll(() => chapterOf(page)).toBe(5)

    await page.reload()
    await expect.poll(() => marker(page)).not.toBeNull()
    await expect(aside).toBeHidden()
    const chapter = await chapterOf(page)

    await showChrome(page)
    await page.getByRole('button', { name: 'Hiện mục lục', exact: true }).click()
    await expect(aside).toBeVisible()
    await expect.poll(async () => (await textArea.boundingBox())?.width).toBe(960)
    await expect.poll(() => chapterOf(page)).toBe(chapter)
  })

  test('reader.prefs.apply: larger font and dark theme apply inside the reader and keep the chapter', async ({ page, context }) => {
    await mockR2(context, { books: FILES })
    await openFromLibrary(page)
    await expect.poll(() => marker(page)).not.toBeNull()
    const defaultSize = (await frameStyle(page)).fontSize
    const startChapter = await chapterOf(page)

    await showChrome(page)
    await page.getByRole('button', { name: 'Tuỳ chỉnh chữ', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Tuỳ chỉnh chữ' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: 'Chữ lớn hơn', exact: true }).click()
    await sheet.getByRole('button', { name: 'Chữ lớn hơn', exact: true }).click()
    await sheet.getByRole('button', { name: 'Nền tối', exact: true }).click()

    await expect.poll(async () => (await frameStyle(page)).bg).toBe('rgb(22, 18, 14)')
    expect((await frameStyle(page)).fontSize).toBeGreaterThanOrEqual(defaultSize * 1.15)
    expect(await chapterOf(page)).toBe(startChapter)
  })
})
